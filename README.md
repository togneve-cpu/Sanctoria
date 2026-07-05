# Sanctoria

Sanctoria is the working repository for the Sanctoria / Elarion campaign materials and Foundry VTT automation.

## Repository structure

```text
module.json                    Foundry VTT module manifest
scripts/                       Foundry VTT automation scripts
  debt-collectors.js           Debt Collectors item automation
  warrenSkinCloak.js           Warren-Skin Cloak item automation

docs/
  campaign-notes/              Campaign planning notes and adventure documentation
  magic-items/                 Magic item writeups and design notes
  npcs/                        NPC guide material and stat/role notes

releases/                      Release notes and packaged module references
```

## Foundry module

This repository is intended to function as the **Sanctoria Automation** Foundry module root.

To install manually, copy or clone this repository folder into your Foundry `Data/modules/` directory so the path becomes:

```text
Data/modules/Sanctoria/module.json
```

or rename the folder to:

```text
Data/modules/sanctoria-automation/module.json
```

Then enable **Sanctoria Automation** in the Foundry world.

## Current automation milestone

The Warren-Skin Cloak is automated through its Level 20 capstone in module version `0.7.0`:

- Survivor's Reflex
- Refuse the First Fall
- Predator's Memory
- Gnawing Persistence
- Shared Endurance reminder
- Hold the Line
- Law of the Warren

Debt Collectors automation is also preserved in the module.
