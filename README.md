# Pokemon GO Mega Tracker
A tracker for your Mega pokemon, so that you can check when your mega pokemon are able to level up for free.

### Conversion TODOs
- [x] Make sure Dates work properly w/ the RPCs
- [x] Get React up and running
- [x] Switch all "server" code to use zustand + persist instead of lowdb + etc.

### Enhancements
- [ ] Make site prettier
  - [ ] Buttons don't have styling
  - [ ] Select menus don't have styling
  - [ ] Add images for pokemon
  - [ ] Add a real favicon
  - [ ] Make colors nicer (background color, button colors, etc)
- [ ] Make site easier to use
  - [ ] Editing fields is clunky and unintuitive
  - [ ] Weird behavior: When editing the mega level for the first time, we don't update the mega level up timestamp, so the "days until mega" timer looks like its stuck at zero
  - [ ] Bug: The `-` button for `CountdownTimer` is invisible when editing
- [ ] Finish events page
- [ ] Move page state to the URL
