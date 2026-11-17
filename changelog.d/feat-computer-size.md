### Added

- Agents can ask for a large cloud computer (8 vCPU) when `computer_start` creates a machine, for Blender renders, video encodes and screen recordings. `computer_start` and `computer_list` show each machine's size. A large machine uses 2.5 runtime minutes per minute on the Agent Computer plan. It needs the Agent Computer service with machine sizes; an older service ignores the size and starts a standard machine.
