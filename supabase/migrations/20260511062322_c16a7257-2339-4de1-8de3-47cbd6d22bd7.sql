-- Buckets
insert into storage.buckets (id, name, public) values
  ('course-materials','course-materials', false),
  ('assignment-submissions','assignment-submissions', false),
  ('private-files','private-files', false)
on conflict (id) do nothing;

-- Helper: extract topic id from material path "topicId/filename"
-- We rely on storage.foldername(name)[1] = topic_id (uuid string)

-- ===== course-materials =====
create policy "materials read enrolled/instr/admin"
on storage.objects for select to authenticated
using (
  bucket_id = 'course-materials' and (
    public.has_role(auth.uid(),'admin') or
    exists (
      select 1 from public.course_topics t
      where t.id::text = (storage.foldername(name))[1]
        and (public.is_enrolled(auth.uid(), t.course_id) or public.teaches(auth.uid(), t.course_id))
    )
  )
);

create policy "materials write instr/admin"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'course-materials' and (
    public.has_role(auth.uid(),'admin') or
    exists (
      select 1 from public.course_topics t
      where t.id::text = (storage.foldername(name))[1]
        and public.teaches(auth.uid(), t.course_id)
    )
  )
);

create policy "materials delete instr/admin"
on storage.objects for delete to authenticated
using (
  bucket_id = 'course-materials' and (
    public.has_role(auth.uid(),'admin') or
    exists (
      select 1 from public.course_topics t
      where t.id::text = (storage.foldername(name))[1]
        and public.teaches(auth.uid(), t.course_id)
    )
  )
);

-- ===== assignment-submissions =====
-- Path layout: assignmentId/userId/filename
create policy "subs read own/instr/admin"
on storage.objects for select to authenticated
using (
  bucket_id = 'assignment-submissions' and (
    public.has_role(auth.uid(),'admin') or
    auth.uid()::text = (storage.foldername(name))[2] or
    exists (
      select 1 from public.assignments a
      where a.id::text = (storage.foldername(name))[1]
        and public.teaches(auth.uid(), public.course_of_topic(a.topic_id))
    )
  )
);

create policy "subs upload own"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'assignment-submissions'
  and auth.uid()::text = (storage.foldername(name))[2]
);

create policy "subs delete own"
on storage.objects for delete to authenticated
using (
  bucket_id = 'assignment-submissions'
  and auth.uid()::text = (storage.foldername(name))[2]
);

-- ===== private-files =====
create policy "pf own all"
on storage.objects for all to authenticated
using (
  bucket_id = 'private-files'
  and auth.uid()::text = (storage.foldername(name))[1]
)
with check (
  bucket_id = 'private-files'
  and auth.uid()::text = (storage.foldername(name))[1]
);
