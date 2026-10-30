# Part-5: UX Feedback Implementation

## Shared utility

`src/utils/feedback.ts` provides two safe browser enhancements:

- `triggerHaptic(durationMs = 20)` calls `navigator.vibrate()` when supported, clamps vibration to a subtle 10–30 ms, and catches unsupported/blocked cases.
- `playSuccessTone()` synthesizes a quiet, short sine tone through the Web Audio API. It uses no external audio asset and safely handles missing or suspended audio support.

Neither function displays UI text, makes network requests, or blocks the user workflow.

## Interaction coverage

`src/App.tsx` installs one delegated capture listener for buttons, button-like controls, checkboxes, radio buttons, selects, and elements marked with `data-haptic`. Browser Back/Forward history changes also trigger subtle haptic feedback where supported. The listener is cleaned up on unmount.

## Success feedback

- Sales invoice: feedback plays after `onSubmitSale` resolves successfully; failures remain on the existing error path.
- Manual purchase: feedback plays only after the purchase API returns a successful response.
- Quick purchase: haptic feedback follows each successful saved page; the success tone plays when the final purchase save completes, not on intermediate pages.
- Expense: feedback plays only after the expense API confirms the record was saved.
- Business profile: a success tone plays when a user-modified profile transitions to 100% completion. Merely opening an already-complete profile does not play the tone. Saving the profile also provides haptic feedback.

## Browser behavior and limitations

Vibration is not supported by every browser/device and may be restricted by operating system settings. Web Audio can be blocked by browser autoplay policies; all feedback is best-effort and errors are swallowed so core app actions continue normally. Browser-level back/forward feedback only runs when the page receives a `popstate` event.

## Verification

TypeScript transpilation syntax checks passed for all seven modified/new TypeScript files. A full `tsc --noEmit` check could not run because this extracted project does not have dependencies installed (`vite/client` type definitions are missing). Production build and device testing have not been performed in this environment.
