# syntax=docker/dockerfile:1

FROM public.ecr.aws/amazonlinux/amazonlinux:2.0.20220805.0 as builder

RUN <<EOF
    amazon-linux-extras install -y nginx1 php7.4
    yum groupinstall -y "Development Tools"
    yum install -y php-devel php-{opcache,curl,gd,intl,mbstring,soap,xml,zip,dom,imagick,posix,pear} php-pecl-{igbinary,redis}
    yum clean all && rm -rf /var/cache/yum
    curl -sS https://raw.githubusercontent.com/composer/getcomposer.org/9bef96e8ce65b79bd29c525fa918980889c9a124/web/installer | php -- --quiet
    mv composer.phar /usr/local/bin/composer
EOF

ADD run.sh /srv/run.sh
ADD bedrock/ /srv/bedrock/
ADD opcache/ /srv/opcache/

RUN cd /srv/bedrock && COMPOSER_ALLOW_SUPERUSER=1 composer install --no-dev

FROM public.ecr.aws/amazonlinux/amazonlinux:2.0.20220805.0
COPY --from=public.ecr.aws/awsguru/aws-lambda-adapter:0.3.3 /lambda-adapter /opt/extensions/lambda-adapter
ARG DISABLE_OPCACHE_PRE_COMPILATION=false

RUN <<EOF
    amazon-linux-extras install -y nginx1 php7.4
    yum install -y php-{opcache,curl,gd,intl,mbstring,soap,xml,zip,dom,imagick,posix} php-pecl-{igbinary,redis}
    yum clean all && rm -rf /var/cache/yum
EOF

ADD config/nginx/ /etc/nginx/
ADD config/php/ /etc/
COPY --from=builder /srv /srv

RUN <<EOF
    if [[ "${DISABLE_OPCACHE_PRE_COMPILATION}" = "false" ]]; 
    then 
        mkdir /tmp/opcache 
        chmod 777 /tmp/opcache
        /usr/sbin/php-fpm && nginx
        curl --no-progress-meter localhost:8080/app/prime_opcache.php
        rm /srv/bedrock/web/app/prime_opcache.php
        chmod -R 777 /tmp/opcache && rm -rf /srv/opcache && mv /tmp/opcache /srv/
    fi

    rm -rf /srv/bedrock/web/app/uploads
    mkdir -p /mnt/share/uploads
    ln -sfn /mnt/share/uploads /srv/bedrock/web/app/uploads
EOF

CMD ["/srv/run.sh"]
