# Admin Panel Part 3-A: Customer Administration and Security

## Scope
This update focuses on the administrative customer-management and account-security workflow. The existing bottom navigation remains **Home**, **Store**, and **Orders**; the Store and Orders implementations have not been redesigned as part of this change.

## Customer management
1. Open **Settings → Admin Panel Login** and sign in with the configured admin credentials.
2. The panel header reads **ADMIN PANEL**. Use the bottom navigation to switch between Home, Store, and Orders.
3. In **Home**, search registered customers by name or mobile number and select **Refresh Accounts** to reload the list.
4. Select a customer row to expand its controls.
5. Use **Reset Password** to set a new password that meets the server validation rules.
6. Use **Add Wallet Transaction** to record Payment In, Payment Out, or Add Due.
7. Use **Set Monthly Recurring Fee** to set a recurring fee. The service processes each elapsed 30-day cycle, records each cycle in the transaction history, and adds the amount to the due balance. Processing runs hourly while the server is running and also runs when the customer-wallet list is requested.
8. The customer summary uses red for a positive due balance, blue for a net advance, and green for a settled/zero balance. The expanded wallet view includes historical monthly totals for Payment In, Payment Out, Due Added, and Net Advance, based on the available transaction history.

## Account deletion
1. Expand the customer row and select **Delete Account**.
2. Review the permanent-deletion warning. Type `DELETE` exactly and select **Confirm Delete**.
3. The server removes tenant-owned records, wallet data, sessions, cashier access, and the customer account in a database transaction. It also creates active block records for the mobile number and registered browser-installation tokens.
4. If deletion fails, the database transaction is rolled back and an error is shown.

## Locked Devices
1. In Home, select **Locked Devices**.
2. The list shows blocked mobile-number entries and registered browser-device token entries, including the block reason and date. Device tokens are displayed only as a short hash prefix.
3. Select **Unlock** to remove that specific block entry. A mobile number or device can still be denied if another active block remains; unlock each relevant entry when access should be restored. After an account has been deleted, the user must register again once the mobile-number block is removed.

## Device-token note
The browser sends an app-generated persistent identifier stored in `localStorage`, and the server stores only its SHA-256 hash. This supports blocking the same browser installation while its local storage remains intact. It is **not a hardware-level device fingerprint** and can be changed if browser storage is cleared or a different browser/device is used. The mobile-number block remains independent of the browser token until an administrator unlocks it.

## Database migration
On server startup, the application creates `admin_device_registry` and `admin_access_blocks` if they do not exist. No manual migration is needed for a fresh deployment. Back up the database before using permanent account deletion in production.

## Validation performed
- TypeScript transpile/syntax checks passed for `server.ts`, `src/components/AdminPortalModal.tsx`, and `src/utils/api.ts`.
- Updated admin/auth UI files were scanned for Devanagari characters; none were found.
- A full `npm run build` / type-check could not be completed in this environment because dependency installation timed out and `vite/client` is unavailable locally. Run `npm install`, `npm run lint`, and `npm run build` in the deployment environment before production rollout.
