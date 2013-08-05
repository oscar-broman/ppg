#!/bin/sh

BASEDIR=$(dirname $0)

sass --watch $BASEDIR/public/css/ppg.scss:$BASEDIR/public/css/ppg.css &>/dev/null &
