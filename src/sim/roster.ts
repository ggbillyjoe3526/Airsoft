/**
 * Who plays on which team (M98): the player picks Alpha or Beta, so nothing may take the player's team to be team 0.
 * The player is always character 0 (the id is its place in GameState.characters), with its teammates after it and the
 * other team last; per-team values (sizes, the bots' levels) are by team index. Pure.
 */

/** Per team index (Alpha, Beta): `mine` for the player's team, `theirs` for the other. */
export function byTeam<T>(playerTeam: number, mine: T, theirs: T): [T, T] {
  return playerTeam === 0 ? [mine, theirs] : [theirs, mine];
}

/**
 * Each character's team by id: the player (id 0) and its `mine - 1` teammates on `playerTeam`, then the `theirs` of
 * the other team. With the player on Alpha this is the order every match had before the pick.
 */
export function rosterTeams(playerTeam: number, mine: number, theirs: number): number[] {
  const teams: number[] = [];
  for (let i = 0; i < mine; i++) teams.push(playerTeam);
  for (let i = 0; i < theirs; i++) teams.push(1 - playerTeam);
  return teams;
}
