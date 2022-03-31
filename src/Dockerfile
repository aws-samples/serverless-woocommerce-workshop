FROM public.ecr.aws/amazonlinux/amazonlinux:2.0.20220218.3 as builder

RUN amazon-linux-extras install -y nginx1 php7.4 && yum groupinstall -y "Development Tools" &&\
    yum install -y php-devel php-config git tar php-opcache php-redis php-pecl-redis php-pecl-memcache php-curl php-gd php-intl php-mbstring php-soap \
    php-xml php-xmlrpc php-zip php-dom php-imagick php-posix php-pear &&\
    yum clean all && rm -rf /var/cache/yum

RUN pecl install pcov && echo 'extension=pcov.so' > /etc/php.d/20-pcov.ini &&\
    curl -sS https://raw.githubusercontent.com/composer/getcomposer.org/9bef96e8ce65b79bd29c525fa918980889c9a124/web/installer | php -- --quiet &&\
    mv composer.phar /usr/local/bin/composer

ADD run.sh /app/run.sh
ADD bedrock/ /app/bedrock/

RUN cd /app/bedrock && composer install --no-dev && cd /app/bedrock/web/app/mu-plugins/s3-uploads && composer install --no-dev

FROM public.ecr.aws/amazonlinux/amazonlinux:2.0.20220218.3
COPY --from=public.ecr.aws/awsguru/aws-lambda-adapter:0.3.2 /lambda-adapter /opt/extensions/lambda-adapter

RUN amazon-linux-extras install -y nginx1 php7.4 && yum install -y php-opcache php-redis php-pecl-redis php-pecl-memcache php-curl php-gd php-intl php-mbstring php-soap \
    php-xml php-xmlrpc php-zip php-dom php-imagick php-posix php-pear && yum clean all && rm -rf /var/cache/yum

COPY --from=builder /usr/lib64/php/modules/pcov.so /usr/lib64/php/modules
COPY --from=builder /etc/php.d/20-pcov.ini /etc/php.d

ADD config/nginx/ /etc/nginx/
ADD config/php/ /etc/
COPY --from=builder /app /app

RUN mkdir /tmp/opcache && chmod 777 /tmp/opcache \
    && /usr/sbin/php-fpm && nginx && curl --no-progress-meter localhost:8080/app/prime_opcache.php \
    && rm /app/bedrock/web/app/prime_opcache.php && chmod -R 777 /tmp/opcache \
    && mv /tmp/opcache /app/ && ls -lh /app/opcache

CMD ["/app/run.sh"]
