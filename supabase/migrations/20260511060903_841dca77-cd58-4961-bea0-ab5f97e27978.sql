
-- Roles enum & user_roles
CREATE TYPE public.app_role AS ENUM ('admin','instructor','student');

CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT NOT NULL DEFAULT '',
  avatar_url TEXT,
  email TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  UNIQUE (user_id, role)
);

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id=_user_id AND role=_role);
$$;

-- Trigger to auto-create profile + default student role on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, email)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name',''), NEW.email);
  INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'student');
  RETURN NEW;
END;
$$;
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Courses
CREATE TABLE public.courses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.enrollments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id UUID NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  enrolled_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (course_id, student_id)
);

CREATE TABLE public.instructor_courses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id UUID NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
  instructor_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  UNIQUE (course_id, instructor_id)
);

-- Helper functions
CREATE OR REPLACE FUNCTION public.is_enrolled(_user uuid, _course uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT EXISTS (SELECT 1 FROM public.enrollments WHERE student_id=_user AND course_id=_course);
$$;
CREATE OR REPLACE FUNCTION public.teaches(_user uuid, _course uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT EXISTS (SELECT 1 FROM public.instructor_courses WHERE instructor_id=_user AND course_id=_course);
$$;

CREATE TABLE public.course_topics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id UUID NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  position INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.zoom_lessons (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  topic_id UUID NOT NULL REFERENCES public.course_topics(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  starts_at TIMESTAMPTZ NOT NULL,
  ends_at TIMESTAMPTZ,
  zoom_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.lesson_materials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  topic_id UUID NOT NULL REFERENCES public.course_topics(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  file_url TEXT,
  file_path TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.quizzes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  topic_id UUID NOT NULL REFERENCES public.course_topics(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  opens_at TIMESTAMPTZ,
  closes_at TIMESTAMPTZ,
  time_limit_minutes INT,
  attempts_allowed INT NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.questions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quiz_id UUID NOT NULL REFERENCES public.quizzes(id) ON DELETE CASCADE,
  text TEXT NOT NULL,
  options JSONB NOT NULL,
  correct_index INT NOT NULL,
  position INT NOT NULL DEFAULT 0
);

CREATE TABLE public.quiz_attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quiz_id UUID NOT NULL REFERENCES public.quizzes(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  answers JSONB NOT NULL DEFAULT '{}',
  score NUMERIC,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  submitted_at TIMESTAMPTZ
);

CREATE TABLE public.assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  topic_id UUID NOT NULL REFERENCES public.course_topics(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  due_at TIMESTAMPTZ,
  support_file_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.assignment_submissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  assignment_id UUID NOT NULL REFERENCES public.assignments(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  file_url TEXT,
  file_path TEXT,
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  grade NUMERIC,
  feedback TEXT,
  UNIQUE (assignment_id, student_id)
);

CREATE TABLE public.attendance (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lesson_id UUID NOT NULL REFERENCES public.zoom_lessons(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  present BOOLEAN NOT NULL DEFAULT false,
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (lesson_id, student_id)
);

CREATE TABLE public.grades (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id UUID NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  item TEXT NOT NULL,
  weight NUMERIC NOT NULL DEFAULT 0,
  grade NUMERIC,
  feedback TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.calendar_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  course_id UUID REFERENCES public.courses(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  starts_at TIMESTAMPTZ NOT NULL,
  ends_at TIMESTAMPTZ,
  type TEXT NOT NULL DEFAULT 'event',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  body TEXT,
  read BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.private_files (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  file_path TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.courses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.enrollments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.instructor_courses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.course_topics ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.zoom_lessons ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lesson_materials ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quizzes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quiz_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.assignment_submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.attendance ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.grades ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.calendar_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.private_files ENABLE ROW LEVEL SECURITY;

-- profiles
CREATE POLICY "own profile read" ON public.profiles FOR SELECT TO authenticated USING (id = auth.uid() OR public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'instructor'));
CREATE POLICY "own profile update" ON public.profiles FOR UPDATE TO authenticated USING (id = auth.uid());
CREATE POLICY "admin manage profiles" ON public.profiles FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

-- user_roles
CREATE POLICY "view own roles" ON public.user_roles FOR SELECT TO authenticated USING (user_id = auth.uid() OR public.has_role(auth.uid(),'admin'));
CREATE POLICY "admin manage roles" ON public.user_roles FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

-- courses: students see only enrolled, instructors only assigned, admin all
CREATE POLICY "courses visibility" ON public.courses FOR SELECT TO authenticated USING (
  public.has_role(auth.uid(),'admin')
  OR public.is_enrolled(auth.uid(), id)
  OR public.teaches(auth.uid(), id)
);
CREATE POLICY "admin manage courses" ON public.courses FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

-- enrollments
CREATE POLICY "enrollments read" ON public.enrollments FOR SELECT TO authenticated USING (
  student_id = auth.uid() OR public.has_role(auth.uid(),'admin') OR public.teaches(auth.uid(), course_id)
);
CREATE POLICY "admin manage enrollments" ON public.enrollments FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

-- instructor_courses
CREATE POLICY "instructor_courses read" ON public.instructor_courses FOR SELECT TO authenticated USING (
  instructor_id = auth.uid() OR public.has_role(auth.uid(),'admin')
);
CREATE POLICY "admin manage instructor_courses" ON public.instructor_courses FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

-- course_topics, materials, lessons, quizzes, assignments — visibility tied to course access
CREATE POLICY "topics read" ON public.course_topics FOR SELECT TO authenticated USING (
  public.has_role(auth.uid(),'admin') OR public.is_enrolled(auth.uid(),course_id) OR public.teaches(auth.uid(),course_id)
);
CREATE POLICY "topics write by instr/admin" ON public.course_topics FOR ALL TO authenticated USING (
  public.has_role(auth.uid(),'admin') OR public.teaches(auth.uid(),course_id)
) WITH CHECK (
  public.has_role(auth.uid(),'admin') OR public.teaches(auth.uid(),course_id)
);

CREATE OR REPLACE FUNCTION public.course_of_topic(_topic uuid)
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT course_id FROM public.course_topics WHERE id=_topic;
$$;

CREATE POLICY "lessons read" ON public.zoom_lessons FOR SELECT TO authenticated USING (
  public.has_role(auth.uid(),'admin')
  OR public.is_enrolled(auth.uid(), public.course_of_topic(topic_id))
  OR public.teaches(auth.uid(), public.course_of_topic(topic_id))
);
CREATE POLICY "lessons write" ON public.zoom_lessons FOR ALL TO authenticated USING (
  public.has_role(auth.uid(),'admin') OR public.teaches(auth.uid(), public.course_of_topic(topic_id))
) WITH CHECK (
  public.has_role(auth.uid(),'admin') OR public.teaches(auth.uid(), public.course_of_topic(topic_id))
);

CREATE POLICY "materials read" ON public.lesson_materials FOR SELECT TO authenticated USING (
  public.has_role(auth.uid(),'admin')
  OR public.is_enrolled(auth.uid(), public.course_of_topic(topic_id))
  OR public.teaches(auth.uid(), public.course_of_topic(topic_id))
);
CREATE POLICY "materials write" ON public.lesson_materials FOR ALL TO authenticated USING (
  public.has_role(auth.uid(),'admin') OR public.teaches(auth.uid(), public.course_of_topic(topic_id))
) WITH CHECK (
  public.has_role(auth.uid(),'admin') OR public.teaches(auth.uid(), public.course_of_topic(topic_id))
);

CREATE POLICY "quizzes read" ON public.quizzes FOR SELECT TO authenticated USING (
  public.has_role(auth.uid(),'admin')
  OR public.is_enrolled(auth.uid(), public.course_of_topic(topic_id))
  OR public.teaches(auth.uid(), public.course_of_topic(topic_id))
);
CREATE POLICY "quizzes write" ON public.quizzes FOR ALL TO authenticated USING (
  public.has_role(auth.uid(),'admin') OR public.teaches(auth.uid(), public.course_of_topic(topic_id))
) WITH CHECK (
  public.has_role(auth.uid(),'admin') OR public.teaches(auth.uid(), public.course_of_topic(topic_id))
);

CREATE POLICY "questions read" ON public.questions FOR SELECT TO authenticated USING (
  EXISTS (SELECT 1 FROM public.quizzes q WHERE q.id=quiz_id AND (
    public.has_role(auth.uid(),'admin')
    OR public.is_enrolled(auth.uid(), public.course_of_topic(q.topic_id))
    OR public.teaches(auth.uid(), public.course_of_topic(q.topic_id))
  ))
);
CREATE POLICY "questions write" ON public.questions FOR ALL TO authenticated USING (
  EXISTS (SELECT 1 FROM public.quizzes q WHERE q.id=quiz_id AND (
    public.has_role(auth.uid(),'admin') OR public.teaches(auth.uid(), public.course_of_topic(q.topic_id))
  ))
) WITH CHECK (
  EXISTS (SELECT 1 FROM public.quizzes q WHERE q.id=quiz_id AND (
    public.has_role(auth.uid(),'admin') OR public.teaches(auth.uid(), public.course_of_topic(q.topic_id))
  ))
);

CREATE POLICY "attempts own" ON public.quiz_attempts FOR SELECT TO authenticated USING (
  student_id=auth.uid() OR public.has_role(auth.uid(),'admin')
  OR EXISTS (SELECT 1 FROM public.quizzes q WHERE q.id=quiz_id AND public.teaches(auth.uid(), public.course_of_topic(q.topic_id)))
);
CREATE POLICY "attempts insert own" ON public.quiz_attempts FOR INSERT TO authenticated WITH CHECK (student_id=auth.uid());
CREATE POLICY "attempts update own" ON public.quiz_attempts FOR UPDATE TO authenticated USING (student_id=auth.uid());

CREATE POLICY "assignments read" ON public.assignments FOR SELECT TO authenticated USING (
  public.has_role(auth.uid(),'admin')
  OR public.is_enrolled(auth.uid(), public.course_of_topic(topic_id))
  OR public.teaches(auth.uid(), public.course_of_topic(topic_id))
);
CREATE POLICY "assignments write" ON public.assignments FOR ALL TO authenticated USING (
  public.has_role(auth.uid(),'admin') OR public.teaches(auth.uid(), public.course_of_topic(topic_id))
) WITH CHECK (
  public.has_role(auth.uid(),'admin') OR public.teaches(auth.uid(), public.course_of_topic(topic_id))
);

CREATE POLICY "subs read" ON public.assignment_submissions FOR SELECT TO authenticated USING (
  student_id=auth.uid() OR public.has_role(auth.uid(),'admin')
  OR EXISTS (SELECT 1 FROM public.assignments a WHERE a.id=assignment_id AND public.teaches(auth.uid(), public.course_of_topic(a.topic_id)))
);
CREATE POLICY "subs insert own" ON public.assignment_submissions FOR INSERT TO authenticated WITH CHECK (student_id=auth.uid());
CREATE POLICY "subs update own or instr" ON public.assignment_submissions FOR UPDATE TO authenticated USING (
  student_id=auth.uid() OR public.has_role(auth.uid(),'admin')
  OR EXISTS (SELECT 1 FROM public.assignments a WHERE a.id=assignment_id AND public.teaches(auth.uid(), public.course_of_topic(a.topic_id)))
);

CREATE POLICY "attendance read" ON public.attendance FOR SELECT TO authenticated USING (
  student_id=auth.uid() OR public.has_role(auth.uid(),'admin')
  OR EXISTS (SELECT 1 FROM public.zoom_lessons l WHERE l.id=lesson_id AND public.teaches(auth.uid(), public.course_of_topic(l.topic_id)))
);
CREATE POLICY "attendance write instr/admin" ON public.attendance FOR ALL TO authenticated USING (
  public.has_role(auth.uid(),'admin')
  OR EXISTS (SELECT 1 FROM public.zoom_lessons l WHERE l.id=lesson_id AND public.teaches(auth.uid(), public.course_of_topic(l.topic_id)))
) WITH CHECK (
  public.has_role(auth.uid(),'admin')
  OR EXISTS (SELECT 1 FROM public.zoom_lessons l WHERE l.id=lesson_id AND public.teaches(auth.uid(), public.course_of_topic(l.topic_id)))
);

CREATE POLICY "grades read" ON public.grades FOR SELECT TO authenticated USING (
  student_id=auth.uid() OR public.has_role(auth.uid(),'admin') OR public.teaches(auth.uid(), course_id)
);
CREATE POLICY "grades write" ON public.grades FOR ALL TO authenticated USING (
  public.has_role(auth.uid(),'admin') OR public.teaches(auth.uid(), course_id)
) WITH CHECK (
  public.has_role(auth.uid(),'admin') OR public.teaches(auth.uid(), course_id)
);

CREATE POLICY "events read" ON public.calendar_events FOR SELECT TO authenticated USING (
  user_id=auth.uid() OR public.has_role(auth.uid(),'admin')
  OR (course_id IS NOT NULL AND (public.is_enrolled(auth.uid(),course_id) OR public.teaches(auth.uid(),course_id)))
);
CREATE POLICY "events insert own" ON public.calendar_events FOR INSERT TO authenticated WITH CHECK (
  user_id=auth.uid() OR public.has_role(auth.uid(),'admin') OR (course_id IS NOT NULL AND public.teaches(auth.uid(),course_id))
);
CREATE POLICY "events update own/admin/instr" ON public.calendar_events FOR UPDATE TO authenticated USING (
  user_id=auth.uid() OR public.has_role(auth.uid(),'admin') OR (course_id IS NOT NULL AND public.teaches(auth.uid(),course_id))
);
CREATE POLICY "events delete own/admin/instr" ON public.calendar_events FOR DELETE TO authenticated USING (
  user_id=auth.uid() OR public.has_role(auth.uid(),'admin') OR (course_id IS NOT NULL AND public.teaches(auth.uid(),course_id))
);

CREATE POLICY "notif own" ON public.notifications FOR SELECT TO authenticated USING (user_id=auth.uid());
CREATE POLICY "notif update own" ON public.notifications FOR UPDATE TO authenticated USING (user_id=auth.uid());
CREATE POLICY "notif admin all" ON public.notifications FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

CREATE POLICY "pf own" ON public.private_files FOR ALL TO authenticated USING (user_id=auth.uid()) WITH CHECK (user_id=auth.uid());
