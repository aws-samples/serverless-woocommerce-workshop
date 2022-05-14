FROM public.ecr.aws/amazonlinux/amazonlinux:2.0.20220218.3 as builder

RUN amazon-linux-extras install -y nginx1 php7.4 && yum groupinstall -y "Development Tools" &&\
    yum install -y php-devel php-config git tar php-opcache php-redis php-pecl-redis php-pecl-memcache php-curl php-gd php-intl php-mbstring php-soap \
    php-xml php-xmlrpc php-zip php-dom php-imagick php-posix php-pear &&\
    yum clean all && rm -rf /var/cache/yum

RUN curl -sS https://raw.githubusercontent.com/composer/getcomposer.org/9bef96e8ce65b79bd29c525fa918980889c9a124/web/installer | php -- --quiet &&\
    mv composer.phar /usr/local/bin/composer

ADD run.sh /srv/run.sh
ADD bedrock/ /srv/bedrock/

RUN cd /srv/bedrock && composer install --no-dev

FROM public.ecr.aws/amazonlinux/amazonlinux:2.0.20220218.3
COPY --from=public.ecr.aws/awsguru/aws-lambda-adapter:0.3.2 /lambda-adapter /opt/extensions/lambda-adapter

RUN amazon-linux-extras install -y nginx1 php7.4 && yum install -y php-opcache php-redis php-pecl-redis php-pecl-memcache php-curl php-gd php-intl php-mbstring php-soap \
    php-xml php-xmlrpc php-zip php-dom php-imagick php-posix php-pear && yum clean all && rm -rf /var/cache/yum

ADD config/nginx/ /etc/nginx/
ADD config/php/ /etc/
COPY --from=builder /srv /srv

RUN mkdir /tmp/opcache && chmod 777 /tmp/opcache \
    && /usr/sbin/php-fpm && nginx && curl --no-progress-meter localhost:8080/app/prime_opcache.php \
    && rm /srv/bedrock/web/app/prime_opcache.php && chmod -R 777 /tmp/opcache \
    && mv /tmp/opcache /srv/ && ls -lh /srv/opcache

RUN rm -rf /srv/bedrock/web/app/uploads && mkdir -p /mnt/share/uploads && ln -sfn /mnt/share/uploads /srv/bedrock/web/app/uploads

CMD ["/srv/run.sh"]
