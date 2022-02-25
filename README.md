# Serverless WooCommerce

Highly scalable WooCommerce on Serverless

## Prerequisites

To build and deploy this stack, please have the following tools installed. 

- docker
- node.js
- aws cli
- aws cdk

## Configuration

This stack use .env file to provide configuration values. 

Copy cdk/.env.example to cdk/.env and update the values to fit your needs. 

## Deployment

Preview the changes

```shell
make diff
```

Deploy the stack

```shell
make deploly
````
