# Sephral’s Map Knowledge: Manual

Map Knowledge marks parts of a map as explored for players. Explored is what Foundry’s fog of war remembers: players see the map there in the explored fog color, but tokens and other things in that area stay hidden until a token of theirs really sees it. Token vision keeps working as before, so everything the players explore themselves is added on top.

It needs Foundry 14 and a scene with *Token Vision* and *Fog Exploration* turned on (scene settings, tab *Lighting*). The window warns when one of them is off.

## The tools

Pick *Map Knowledge* in the scene controls. The window opens next to it (see the setting *Open the window with the tools*).

| Tool | How |
| --- | --- |
| Rectangle | Drag across the map. Hold Shift for a square |
| Ellipse | Drag across the map. Hold Shift for a circle |
| Polygon | Click the corners. A double click or a click on the first corner finishes it, a right click or Ctrl+Z removes the last corner, Escape stops |
| Room | Click into a room. The area reachable in straight lines from that point without crossing a wall that blocks movement is revealed, closed doors and windows count as walls. A room with corners may need a second click. The room under the mouse is shown before you click |
| Hide instead of reveal | Switches every tool to hide. Holding Alt while you draw or click does the same for one shape |
| Show what the players know | The tint over unknown areas (see below) |
| View as a player | Button. Looks at the map as the next player knows it: off, then each player, then off again (see below) |
| Check before applying | Toggle. A finished shape waits until you apply it (see below) |
| Map Knowledge window | Opens the window |
| Undo | Takes the last change back, also Ctrl+Z while the tools are active |

A preview shows the shape while you draw it, green for reveal and red for hide.

## The window

* **Reveal and Hide:** what the tools do.
* **For:** all players, or only the chosen players. Ticking a single player switches to the chosen players. A dot shows who is online. With shared fog every change counts for everyone and the choice is locked.
* **This Level:** reveal or hide the whole Level for the chosen players. Hiding asks first: the players forget everything of this Level, their tokens see again what is in sight right now.
* **What a player knows:** gives the chosen players everything the picked player knows of this Level, for example when the scout reports back.
* **View:** shows what the chosen players together, or one player, do not know yet as a tint on your map. It updates after every change and a few seconds after tokens move. Color and strength are settings.
* **Last change and Undo:** what happened last, for how many players, and the button to take it back.

## View as a player

Look at your map the way one player knows it. Everything that player has not explored is covered in black, what they know is clear. The cover is that player's own fog of war as the world stores it, so it includes what they explored themselves and everything Map Knowledge revealed for them. With shared fog all players see the same map, so the cover shows what all of them explored together.

* **Switch quickly:** the *View as a player* button in the scene controls goes through off, each player and off again. The window has a button per player and *Off*. A bar at the top of the screen says *Viewing as Name, read only* and has previous, next and *Leave the view*. In Foundry's key settings you can give keys to *View as the next player* and *View as the previous player*.
* **Read only:** the view reads the stored explorations and draws them into pictures of your browser. It does not write any fog of war, does not create a change and has nothing to undo. The view lives in your browser only and is off after a reload.
* **Stays on:** the cover stays when you pick another group of tools or select tokens, and it follows you to other scenes and Levels. It updates after every change, a few seconds after tokens move and every few seconds while the player is online.
* **Not live sight:** you see the remembered map, not what the player sees at this moment. Tokens, doors and notes in explored ground stay visible to you, the player sees them only in sight of a token. Lighting and hidden tokens are not simulated.

## Check before applying

Switch on *Check before applying* (scene control with the clipboard, or the checkbox in the window). A finished shape from the rectangle, ellipse, polygon or room tool, or with Alt a hide, does not go to the players. It waits and its outline stays on the map. Your map shows what the player would know after the change: the first of the chosen players, or the player of the view. The bar at the top offers:

* **Previous and next** to look at the result as another player. If that player is not among the chosen players, the bar says that they do not get the change.
* **Apply** sends all waiting shapes in order, each as its own change with its own undo.
* **Discard** throws them away. Escape does the same while no shape is being drawn (Foundry closes an open window first, so press it again). A new scene or Level discards them too.

Several shapes can wait together. The whole Level, sharing and Region triggers are applied at once and are not checked.

## Who gets a change

* Players who are online and look at that scene and Level see the change at once. Their own browser draws it into their fog and saves it, so nothing they explored in the last seconds gets lost.
* Players who are online but look at another scene or Level get it saved for later, by their own browser.
* For players who are offline, or whose browser does not answer within a few seconds, the GM’s browser saves it. They see it on their next visit.
* A change always applies to the scene and Level you are looking at. Changes from a Region apply to the Level of the token that walked in.

## Undo

The GM’s browser keeps what every player knew before each of your last 20 changes. Undo puts that back inside the shapes of the change and leaves everything outside them as it is now, including what the players explored since. The history is kept until you reload the page.

## Region behavior

Add the behavior *Map Knowledge* to a Region (Region configuration, tab *Behaviors*):

* **Events:** when it happens, for example when a token moves into the Region (the default), enters it, or starts its turn there.
* **Area:** the Region whose area the players learn. Empty means this Region itself, so a small trigger at a door can reveal the whole hall behind it.
* **Who learns it:** the owners of the token, or all players. With shared fog all players learn it.
* **Hide instead:** the players forget the area.
* **Only tokens of players:** tokens no player owns do not trigger it (on by default).
* **Only once:** the behavior switches itself off after the first time (on by default).

The active GM must be online for the behavior to work.

## Settings

| Setting | What it does |
| --- | --- |
| Module language | Follow Foundry, Deutsch or English, on this device |
| Look | Signature (warm paper) or Foundry (dark) for the window |
| Open the window with the tools | Opens the window whenever you pick the tools |
| Tint of unknown areas | Color of the view of what players know |
| Strength of the tint | How strongly it covers |
| Tell players about changes | Players get a short notice when you reveal or hide areas for them (off by default) |
| Check before applying | Finished shapes wait until you apply them (off by default, on this device) |

Your choice of players and of the view is kept in your browser.

## Keys

*Open the Map Knowledge window*, *Switch between reveal and hide*, *View as the next player* and *View as the previous player* have no keys by default. Set them in Foundry’s *Configure Controls*.

## Self test

*Run self test* in the module settings checks what Map Knowledge needs from Foundry: the Foundry version, the fog of war it draws into, fog exploration per Level, the wall polygons for the room tool, the Region behavior, the module socket, the tools on the canvas, its settings and texts, and draws a small test map. The result comes as a notification and a chat message only you see, with the Foundry version the module was verified with. After a Foundry update you get a one time notice to run it.

## Debug file

For bug reports, the GM saves one file about all of Sephral’s modules in this world: `Save debug file` in the module settings, or `Save Debug File (Sephral’s Modules)` in the context menu of a chat message. It holds the versions of Foundry, the system and the active modules, the settings of the modules and what they recorded, for Map Knowledge the viewed scene with its fog settings, the number of Map Knowledge behaviors, which players are online, and your recent changes with their result per player. Pictures of the fog are left out. Macros call `game.modules.get("sephrals-map-knowledge").api.saveDebugFile()`.

The file contains chat text and whispers. Check it before you share it.

## Sephral’s Modules

The first button in the module settings, *Sephral’s Modules* (GMs only), opens one window for all of Sephral's modules in the world: the version, self test, settings, manual and demo video of each, a button that switches on an installed module that is off (Foundry then reloads the world for everyone), and the debug file. Below, *More from Sephral* lists other modules that fit the game system of the world, shown only after a click, each with its demo video and an *Install* button. Foundry installs modules only on its setup screen, so the button copies the module's link (manifest URL) and shows the steps with a short clip. When the GM launches the world again, the window opens once with the new module and its *Enable* button. The list is part of the module. Only a video you start is loaded, from the module page on GitHub.

## Storage

Map Knowledge keeps nothing of its own in the world. What a player knows is Foundry’s fog exploration of that player for the scene and Level, saved in the world. *Reset Fog of War* in the scene context menu removes it for everyone, including what Map Knowledge revealed.

## Limits

* Revealed areas are remembered, not seen: tokens, doors and notes there stay hidden until a token of the player sees them.
* Foundry stores the fog of large scenes at a reduced size (sides longer than 4096 pixels), so edges are a little soft there.
* A player who reloads the page while a change arrives may miss it, the GM’s window then reports it.

## Macro API

`game.modules.get("sephrals-map-knowledge").api` offers (GM only unless noted):

| Function | What it does |
| --- | --- |
| `open()` | Opens the window |
| `reveal(shapes, options)` | Reveals shapes. A shape is `{x, y, width, height}` or one made with `shapes`. Options: `users` (user IDs, the chosen players by default), `scene`, `level` (the viewed ones by default). Returns the change with the result per player |
| `hide(shapes, options)` | Hides shapes, same options |
| `revealRegion(region, options)` | Reveals the area of a Region, `{hide: true}` hides it |
| `revealLevel(options)`, `hideLevel(options)` | The whole viewed Level. Option `users` |
| `share(fromUserId, users)` | Gives players what another player knows of the viewed Level |
| `undo()` | Takes the last change back |
| `knows(point, {user, scene, level})` | Whether a user knows a point. Players may ask about themselves |
| `shapes.rect(a, b)`, `shapes.ellipse(a, b)`, `shapes.polygon(points)` | Shapes from corners or points, with `{square}` or `{circle}` as third argument for the first two |
| `chosenPlayers()` | The players the window has chosen |
| `changes()` | Your recent changes, newest last |
| `hideMode()`, `setHideMode(hide)` | Reads or switches between reveal and hide |
| `viewAs(user)` | Looks at the map as that player knows it (user or ID), `null` turns the view off. Returns the ID now viewed, empty for off |
| `viewingAs()` | The ID of the player of the view, empty when it is off |
| `viewNext(step)` | The next player of the view, `-1` the previous one. Off is part of the round |
| `pending()` | The shapes that wait for the check: `{action, shapes, kind}` |
| `applyPending()` | Applies the waiting shapes, returns the changes |
| `discardPending()` | Throws the waiting shapes away |
| `runSelfTest()` | Runs the self test |
| `saveDebugFile()` | Saves the debug file |

After every change and undo the hook `sephrals-map-knowledge.changed` is called with the change.

## Usage statistics

The module can take part in a small usage report shared by all of Sephral’s modules. Nothing is counted or sent until the GM agrees: shortly after the world starts, the active GM is asked, and the question comes back at every start until there is an answer. The answer counts for all of Sephral’s modules in the world. *Share usage statistics* in the module settings turns the report on or off at any time, and *Manage statistics* below it shows what the report contains right now.

With the GM’s consent only the active GM’s browser counts, and it sends at most one report a day. The counts are kept in a hidden world setting, so all browsers and computers of the GM count together, and turning the statistics off deletes them. A copy of a world gets its own world ID. The question lists everything the report contains, from the Foundry version to a random world ID. For Map Knowledge it holds:

* on how many of the last 30 days the module was used
* how often the GM reveals, hides, uses the polygon and the room tool, changes a whole Level, shares a player’s knowledge, takes a change back, shows what the players know, and how often a Region triggers, how often the player view is turned on and switched, and how often a checked change is applied or discarded
* the settings *Look*, *Open the window with the tools*, *Tell players about changes* and *Check before applying* (only the chosen option)
* where errors occur in the module code: file, line, error type and whether the error arose in the module itself, in Foundry, in the game system or in another module, never the error message or the name of another module

No names, notes, pictures or other content of the world are sent.
