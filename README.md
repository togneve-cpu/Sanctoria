# Sanctoria

Sanctoria is the working repository for the Sanctoria / Elarion campaign materials and Foundry VTT automation.

## Repository structure

```text
foundry/
  sanctoria-automation/      Foundry VTT local module used for custom item/NPC automation

docs/
  campaign-notes/            Campaign planning notes and adventure documentation
  magic-items/               Magic item writeups and design notes
  npcs/                      NPC guide material and stat/role notes

releases/                    Release notes and packaged module references
```

## Foundry module

The current module lives at:

```text
foundry/sanctoria-automation/
```

To install manually, copy that folder into your Foundry `Data/modules/` directory so the path becomes:

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
