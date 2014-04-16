#!/bin/sh

sass --watch public/css/ppg.scss:public/css/ppg.css &
SASS=$!
node node_modules/nodemon/bin/nodemon.js -i public lib/ppg.js &
NODEMON=$!

function cleanup {
	kill $SASS
	kill $NODEMON
	wait $SASS
	wait $NODEMON
	exit
}

trap cleanup SIGHUP SIGINT SIGTERM

wait $SASS
wait $NODEMON

cleanup