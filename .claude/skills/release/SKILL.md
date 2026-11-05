---
name: release
description: Cut a release, wait for green CI, build the image, and open the deploy PR
---
1. Check that CHANGELOG has an entry for the new version, and bump versions in all package files.
2. Run the full test suite and the secret scan. Stop on any failure.
3. Commit (-m), tag vX.Y.Z, push the commit and tag.
4. Run `gh run list --commit $(git rev-parse HEAD)` and `gh run watch` until EVERY run, including CodeQL, has succeeded. Don't continue while any run is queued or in progress.
5. Only then dispatch the image build workflow and wait for it to finish.
6. Open the deploy PR. Edit files with the Edit tool, not sed.
7. After I merge, check that the dev site serves the new version.
