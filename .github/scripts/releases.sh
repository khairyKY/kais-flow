# Where every release is published. Sourced (`. .github/scripts/releases.sh`) by release.yml and the
# upload steps of android.yml / desktop.yml, so the list lives in one place.
#
# The first repo is the one everything reads: the apps' update check and download links, the Tauri
# updater (tauri.conf.json), the site, and latest.json's file URLs. It's public and holds only a README
# and release files, so the source repo can go private (docs/log/2026-10-29-0300-release-move-handoff.md).
# khairyKY/kais-flow gets the same release as a bridge for apps installed before the move: their
# updater still reads that repo's latest.json.
#
# GOING PRIVATE, last step: delete " khairyKY/kais-flow" from this line.
RELEASE_REPOS="khairyKY/kais-flow-releases khairyKY/kais-flow"
PRIMARY_REPO="${RELEASE_REPOS%% *}"

# gh against one release repo: this repo with the workflow's own token (GH_TOKEN), any other with
# RELEASES_TOKEN (a fine-grained PAT, Contents read/write on kais-flow-releases only). No token, no
# silent skip: the step fails and says what to make.
rgh() {
  local repo="$1"; shift
  if [ "$repo" = "${GITHUB_REPOSITORY:-}" ]; then gh "$@" -R "$repo"; return; fi
  if [ -z "${RELEASES_TOKEN:-}" ]; then
    echo "::error::No RELEASES_TOKEN secret, so nothing can be published to $repo. Make a fine-grained token (Contents: read and write, on $repo only) and add it as the RELEASES_TOKEN repository secret."
    return 1
  fi
  GH_TOKEN="$RELEASES_TOKEN" gh "$@" -R "$repo"
}

# Attach files to $TAG's release in every repo (replacing same-named ones).
release_upload() {
  local repo
  for repo in $RELEASE_REPOS; do rgh "$repo" release upload "$TAG" "$@" --clobber; done
}
