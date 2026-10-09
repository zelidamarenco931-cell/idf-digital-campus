-- A app faz joins do tipo user_roles -> profiles, enrollments -> profiles, grades -> profiles,
-- mas estas tabelas só tinham chave estrangeira para auth.users. Sem relação com profiles,
-- o PostgREST devolvia erro e as listas de alunos/instrutores ficavam vazias.
-- profiles.id é a chave primária (e já referencia auth.users), por isso a relação é segura.
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT * FROM (VALUES
      ('user_roles',            'user_id',       'user_roles_user_id_profiles_fkey'),
      ('enrollments',           'student_id',    'enrollments_student_id_profiles_fkey'),
      ('instructor_courses',    'instructor_id', 'instructor_courses_instructor_id_profiles_fkey'),
      ('grades',                'student_id',    'grades_student_id_profiles_fkey'),
      ('assignment_submissions','student_id',    'assignment_submissions_student_id_profiles_fkey'),
      ('quiz_attempts',         'student_id',    'quiz_attempts_student_id_profiles_fkey'),
      ('attendance',            'student_id',    'attendance_student_id_profiles_fkey')
    ) AS t(tbl, col, cname)
  LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = r.cname) THEN
      EXECUTE format('ALTER TABLE public.%I ADD CONSTRAINT %I FOREIGN KEY (%I) REFERENCES public.profiles(id) ON DELETE CASCADE', r.tbl, r.cname, r.col);
    END IF;
  END LOOP;
END $$;

NOTIFY pgrst, 'reload schema';
