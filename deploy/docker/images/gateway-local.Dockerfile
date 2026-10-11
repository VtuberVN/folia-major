FROM nginx:1.29-alpine

RUN apk add --no-cache gettext

COPY dist /usr/share/nginx/html
COPY deploy/docker/gateway/nginx.conf.template /etc/nginx/nginx.conf.template
COPY deploy/docker/gateway/entrypoint.sh /usr/local/bin/folia-gateway
RUN chmod 0555 /usr/local/bin/folia-gateway

USER nginx
EXPOSE 8080

ENTRYPOINT ["/usr/local/bin/folia-gateway"]
