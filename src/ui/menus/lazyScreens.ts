/**
 * The screens fetched the first time one opens (IM1): the Loadout (with Customise), the Armory and Settings, in a chunk
 * of their own, so the start-up file carries only the title, the Match screen and what a match needs. `Menus` preloads
 * it in the background once the title is up (core/onDemand.ts), so opening one rarely waits.
 */
export { ArmoryScreen } from './armoryScreen';
export { LoadoutScreen } from './loadoutScreen';
export { SettingsScreen } from './settingsScreen';
