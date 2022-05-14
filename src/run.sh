#!/bin/bash

if [ -d "/srv/opcache" -a ! -d "/tmp/opcache" ]
then
    mkdir /tmp/opcache
    time cp -r /srv/opcache/* /tmp/opcache
fi

if [ ! -d '/mnt/share/uploads' ]
then
   mkdir -p /mnt/share/uploads
fi 

/usr/sbin/php-fpm

exec nginx -g "daemon off;";
