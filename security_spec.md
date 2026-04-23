# Security Specification for Beatrice

## Data Invariants
1. A user can only access their own profile and settings.
2. Memories, files, annotations, and reminders MUST belong to the authenticated user.
3. Users cannot modify shadow user profile fields like `googleAccessToken` once set, or they should be protected. (Actually the app saves it in localStorage and optionally in Firestore, but it's personal data).
4. Timestamp fields MUST be validated against server time.
5. Content fields MUST have size limits.

## The Dirty Dozen Payloads (Targeting common vulnerabilities)

1. **Identity Spoofing**: Attempt to create a memory in another user's path.
   - Path: `/users/target_user_id/memories/bad_id`
   - Payload: `{ userId: 'other_user_id', content: 'hacked' }`
   - Expected: `PERMISSION_DENIED`

2. **Shadow Field Injection**: Attempt to set `googleAccessToken` on profile creation if not allowed, or modify it via update without owner permission.
   - Path: `/users/my_id`
   - Payload: `{ email: 'spoof@attacker.com', googleAccessToken: 'stolen_token' }`
   - Expected: `PERMISSION_DENIED` (if rules restrict this)

3. **Orphaned Record Creation**: Attempt to create an annotation for a non-existent file.
   - Path: `/users/my_id/annotations/ann_1`
   - Payload: `{ userId: 'my_id', fileId: 'non_existent_file', textSelection: '...', comment: '...' }`
   - Expected: `PERMISSION_DENIED` (if using `exists()` check)

4. **Resource Exhaustion (Large Content)**: Attempt to save a 2MB string in a memory content.
   - Path: `/users/my_id/memories/mem_1`
   - Payload: `{ content: 'A'.repeat(2000000), type: 'snippet', ... }`
   - Expected: `PERMISSION_DENIED`

5. **Resource Exhaustion (Large ID)**: Attempt to use a 2MB document ID.
   - Path: `/users/my_id/memories/` + 'A'.repeat(2000)
   - Expected: `PERMISSION_DENIED`

6. **Privilege Escalation**: Attempt to delete another user's file.
   - Path: `/users/other_user_id/files/file_1`
   - Expected: `PERMISSION_DENIED`

7. **State Bypass**: Attempt to set a reminder status to 'completed' without proper validation or in a way that bypasses logic.
   - Path: `/users/my_id/reminders/rem_1`
   - Payload: `{ completed: true }` (but without changing updatedAt or other required fields)
   - Expected: `PERMISSION_DENIED` (if strict schema enforced)

8. **Timestamp Spoofing**: Attempt to set `createdAt` to a date in the future.
   - Path: `/users/my_id/memories/mem_1`
   - Payload: `{ createdAt: '2099-01-01T00:00:00Z', ... }`
   - Expected: `PERMISSION_DENIED`

9. **PII Leakage (List Scrape)**: Attempt to list all users.
   - Path: `/users`
   - Expected: `PERMISSION_DENIED`

10. **Null ID Bypass**: Attempting to access `users/null` or `users/undefined`.
    - Path: `/users/null`
    - Expected: `PERMISSION_DENIED`

11. **Type Poisoning**: Sending an object where a string is expected for `content`.
    - Path: `/users/my_id/memories/mem_1`
    - Payload: `{ content: { complex: 'data' } }`
    - Expected: `PERMISSION_DENIED`

12. **Malicious ID Injection**: Injecting special characters or script tags in document IDs.
    - Path: `/users/my_id/memories/<script>alert(1)</script>`
    - Expected: `PERMISSION_DENIED`
