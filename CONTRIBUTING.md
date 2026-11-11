# Web Platform Incubator Community Group

The normative source is `spec.bs`, built with Bikeshed. To validate local edits,
run `bikeshed --die-on=warning spec spec.bs spec.html`; the generated HTML is ignored.
The Build workflow performs the same warning-level validation through spec-prod.

The JavaScript reference implementation lives in `reference-implementation/`.
Run `npm test` with Node.js 20 or later; no dependency installation is required.
Use `npm run demo` or the browser example described in its README to inspect
behavior. Changes to sharing or lifecycle semantics should keep the specification,
explainer, implementation, and public-behavior tests aligned. The existing
upstream Web Platform Tests target an earlier API and are not a conformance claim
for this draft.

This repository is being used for work in the W3C Web Platform Incubator Community Group, governed by the [W3C Community License
Agreement (CLA)](http://www.w3.org/community/about/agreements/cla/). To make substantive contributions,
you must join the CG.

If you are not the sole contributor to a contribution (pull request), please identify all
contributors in the pull request comment.

To add a contributor (other than yourself, that's automatic), mark them one per line as follows:

```
+@github_username
```

If you added a contributor by mistake, you can remove them in a comment with:

```
-@github_username
```

If you are making a pull request on behalf of someone else but you had no part in designing the
feature, you can remove yourself with the above syntax.
