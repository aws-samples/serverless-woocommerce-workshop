#!/bin/bash

if [ ! -d "/mnt/share" ]
then 
    mkdir /mnt/share
fi

if [ -d "/app/opcache" -a ! -d "/tmp/opcache" ]
then
    mkdir /tmp/opcache
    time cp -r /app/opcache/* /tmp/opcache
fi

/usr/sbin/php-fpm

exec nginx -g "daemon off;";
