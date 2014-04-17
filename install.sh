#!/bin/sh

printf "Installing node modules.."

npm update>install.log 2>&1

printf " done.\nInstalling bower components.."

node_modules/bower/bin/bower update>>install.log 2>&1

printf " done.\n\nInstallation finished. Put pawncc or pawncc.exe in node_modules/samp-server/bin/pawncc/\n"