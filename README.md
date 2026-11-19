# The Ratio Decider

A blend simulator for coffee resellers who buy roasted beans and blend them. It is built for Indonesia, Singapore and Thailand specialty cafés.

- Decides exact whole-percent ratios (e.g. 31 : 69) for a target cup.
- Predicts the cup as served (filter, espresso, kopi susu, tubruk, flat white, iced milk, cold brew, espresso tonic) from bag notes, process and roast.
- Can pick the beans for you, check the blend against high-end specialty rules, plan SCA cupping and learn from your cupping log.
- Writes recipe cards and café spec sheets, and checks lot-to-lot consistency with triangle tests.

- Limits suggestions to the countries you can actually source from, finds substitutes that keep the same cup when a bean runs out, and auto-tunes its rules from your cupping logs.

Open `index.html` (or the GitHub Pages site). Your data is never stored in this repository. Without signing in it stays in your browser; sign in under **Settings → Cloud sync** to sync your phone and laptop through the owner's Supabase project (row-level security: only the signed-in owner can read or write).

`tests.html` runs the engine tests in the browser.

Taste scores, varietal effects and style targets are planning estimates, not lab data. Always confirm at the cupping table.