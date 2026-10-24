/**
 * Whether this build may start the auto updater. The release workflow exports
 * TRACKZYN_DESKTOP_SIGNED=true only for builds signed with a real certificate
 * (macOS and Windows); everything else, Linux included, stays unsigned.
 */
export function isSignedBuild(env: Record<string, string | undefined>): boolean {
  return env.TRACKZYN_DESKTOP_SIGNED === 'true'
}
