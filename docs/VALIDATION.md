# Validation

The application does not load sample accounts or placement records automatically. Validate with accounts and student records created from authorized college data.

Checks run during the cleanup:

- Frontend TypeScript check with `npm run lint`.
- Backend Python compilation and module imports.
- Backend health endpoint and browser-origin CORS check.
- Existing master-student records now contain only registration numbers.

The full placement workflow with real student resumes and recruiter jobs has not yet been run end to end.
