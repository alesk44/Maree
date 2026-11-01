-- Evaluate the view with caller permissions and underlying RLS policies.
alter view public.public_fisher_directory
  set (security_invoker = true, security_barrier = true);
