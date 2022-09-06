FROM public.ecr.aws/amazonlinux/amazonlinux:2.0.20220805.0 as builder

RUN amazon-linux-extras install -y nginx1 php8.0 && yum groupinstall -y "Development Tools"

RUN yum install -y php-devel git tar php-opcache php-curl php-gd php-intl php-mbstring php-soap \
    php-xml php-zip php-dom php-imagick php-posix php-pear &&\
    yum clean all && rm -rf /var/cache/yum

RUN pecl install igbinary &&\
    echo "yes" | pecl install redis

RUN curl -sS https://raw.githubusercontent.com/composer/getcomposer.org/9bef96e8ce65b79bd29c525fa918980889c9a124/web/installer | php -- --quiet &&\
    mv composer.phar /usr/local/bin/composer

ADD run.sh /srv/run.sh
ADD bedrock/ /srv/bedrock/
ADD opcache/ /srv/opcache/

RUN cd /srv/bedrock && composer install --no-dev

FROM public.ecr.aws/amazonlinux/amazonlinux:2.0.20220805.0
COPY --from=public.ecr.aws/awsguru/aws-lambda-adapter:0.3.3 /lambda-adapter /opt/extensions/lambda-adapter

RUN amazon-linux-extras install -y nginx1 php8.0 && yum install -y php-opcache php-curl php-gd php-intl php-mbstring php-soap \
    php-xml php-zip php-dom php-imagick php-posix && yum clean all && rm -rf /var/cache/yum

ADD config/nginx/ /etc/nginx/
ADD config/php/ /etc/
COPY --from=builder /srv /srv
COPY --from=builder /usr/lib64/php/modules/. /usr/lib64/php/modules/
RUN printf '[redis]\nextension=/usr/lib64/php/modules/redis.so\n' >> /etc/php.d/redis.ini &&\
    printf '[igbinary]\nextension=/usr/lib64/php/modules/igbinary.so\n' >> /etc/php.d/igbinary.ini

# RUN mkdir /tmp/opcache && chmod 777 /tmp/opcache \
#     && /usr/sbin/php-fpm && nginx && curl --no-progress-meter localhost:8080/app/prime_opcache.php \
#     && rm /srv/bedrock/web/app/prime_opcache.php && chmod -R 777 /tmp/opcache \
#     && mv /tmp/opcache /srv/ && ls -lh /srv/opcache

RUN rm -rf /srv/bedrock/web/app/uploads && mkdir -p /mnt/share/uploads && ln -sfn /mnt/share/uploads /srv/bedrock/web/app/uploads

CMD ["/srv/run.sh"]
