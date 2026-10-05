-- Segurança de testes (quizzes) e notas
-- APLICAR ESTA MIGRAÇÃO NO SUPABASE ANTES DE FAZER MERGE DO CÓDIGO DO FRONTEND.

-- 1. Funções auxiliares apenas para utilizadores autenticados
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.is_enrolled(uuid, uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.teaches(uuid, uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.course_of_topic(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_enrolled(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.teaches(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.course_of_topic(uuid) TO authenticated;

-- 2. Alunos deixam de ler a tabela questions (continha correct_index = respostas certas).
--    Instrutores/admin continuam a ter acesso pela política "questions write" (FOR ALL).
DROP POLICY IF EXISTS "questions read" ON public.questions;

-- 3. Perguntas para o aluno, sem a resposta correta
CREATE OR REPLACE FUNCTION public.get_quiz_questions(_quiz uuid)
RETURNS TABLE (id uuid, text text, options jsonb, "position" int)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _q public.quizzes%ROWTYPE;
  _course uuid;
  _staff boolean;
BEGIN
  SELECT * INTO _q FROM public.quizzes WHERE quizzes.id = _quiz;
  IF NOT FOUND THEN RETURN; END IF;
  _course := public.course_of_topic(_q.topic_id);
  _staff := public.has_role(auth.uid(), 'admin') OR public.teaches(auth.uid(), _course);
  IF NOT (_staff OR public.is_enrolled(auth.uid(), _course)) THEN
    RAISE EXCEPTION 'Sem acesso a este teste';
  END IF;
  IF NOT _staff THEN
    IF _q.opens_at IS NOT NULL AND now() < _q.opens_at THEN RAISE EXCEPTION 'O teste ainda não abriu'; END IF;
    IF _q.closes_at IS NOT NULL AND now() > _q.closes_at THEN RAISE EXCEPTION 'O teste já fechou'; END IF;
  END IF;
  RETURN QUERY
    SELECT qq.id, qq.text, qq.options, qq.position
    FROM public.questions qq WHERE qq.quiz_id = _quiz ORDER BY qq.position;
END;
$$;

-- 4. Correção no servidor (nota de 0 a 20), com prazos e número de tentativas
CREATE OR REPLACE FUNCTION public.submit_quiz(_quiz uuid, _answers jsonb)
RETURNS numeric LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _q public.quizzes%ROWTYPE;
  _total int;
  _correct int;
  _used int;
  _score numeric;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Sessão inválida'; END IF;
  SELECT * INTO _q FROM public.quizzes WHERE id = _quiz;
  IF NOT FOUND THEN RAISE EXCEPTION 'Teste não encontrado'; END IF;
  IF NOT public.is_enrolled(auth.uid(), public.course_of_topic(_q.topic_id)) THEN
    RAISE EXCEPTION 'Apenas alunos inscritos podem submeter este teste';
  END IF;
  IF _q.opens_at IS NOT NULL AND now() < _q.opens_at THEN RAISE EXCEPTION 'O teste ainda não abriu'; END IF;
  IF _q.closes_at IS NOT NULL AND now() > _q.closes_at THEN RAISE EXCEPTION 'O teste já fechou'; END IF;

  SELECT count(*) INTO _used FROM public.quiz_attempts
   WHERE quiz_id = _quiz AND student_id = auth.uid() AND submitted_at IS NOT NULL;
  IF _used >= _q.attempts_allowed THEN RAISE EXCEPTION 'Já usou todas as tentativas deste teste'; END IF;

  SELECT count(*),
         count(*) FILTER (WHERE CASE
           WHEN (_answers ->> qq.id::text) ~ '^[0-9]+$' THEN (_answers ->> qq.id::text)::int = qq.correct_index
           ELSE false END)
    INTO _total, _correct
    FROM public.questions qq WHERE qq.quiz_id = _quiz;

  _score := CASE WHEN _total > 0 THEN round(_correct::numeric / _total * 20, 2) ELSE 0 END;

  INSERT INTO public.quiz_attempts (quiz_id, student_id, answers, score, submitted_at)
  VALUES (_quiz, auth.uid(), _answers, _score, now());

  RETURN _score;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_quiz_questions(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.submit_quiz(uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_quiz_questions(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.submit_quiz(uuid, jsonb) TO authenticated;

-- 5. Tentativas só são criadas pela função submit_quiz (o aluno não pode escrever a própria nota)
DROP POLICY IF EXISTS "attempts insert own" ON public.quiz_attempts;
DROP POLICY IF EXISTS "attempts update own" ON public.quiz_attempts;

-- 6. Entregas: só inscritos entregam; o aluno não pode alterar nota/feedback
DROP POLICY IF EXISTS "subs insert own" ON public.assignment_submissions;
CREATE POLICY "subs insert own enrolled" ON public.assignment_submissions
  FOR INSERT TO authenticated
  WITH CHECK (
    student_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.assignments a
      WHERE a.id = assignment_id
        AND public.is_enrolled(auth.uid(), public.course_of_topic(a.topic_id))
    )
  );

CREATE OR REPLACE FUNCTION public.protect_submission_grading()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _course uuid;
BEGIN
  -- Chamadas sem utilizador (service role / SQL editor) passam sem alterações
  IF auth.uid() IS NULL THEN RETURN NEW; END IF;
  SELECT public.course_of_topic(a.topic_id) INTO _course
    FROM public.assignments a WHERE a.id = NEW.assignment_id;
  IF public.has_role(auth.uid(), 'admin') OR public.teaches(auth.uid(), _course) THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'INSERT' THEN
    NEW.grade := NULL;
    NEW.feedback := NULL;
  ELSE
    NEW.grade := OLD.grade;
    NEW.feedback := OLD.feedback;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS protect_submission_grading ON public.assignment_submissions;
CREATE TRIGGER protect_submission_grading
  BEFORE INSERT OR UPDATE ON public.assignment_submissions
  FOR EACH ROW EXECUTE FUNCTION public.protect_submission_grading();
