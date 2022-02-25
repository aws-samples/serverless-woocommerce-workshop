# Serverless WooCommerce

Highly scalable WooCommerce on Serverless

## Prerequisites

To build and deploy this stack, please have the following tools installed. 

- docker
- node.js
- aws cli
- aws cdk
- gnu make

You also need a DNS domain hosted on Route53. 

## Configuration

This stack use .env file to provide configuration values. 

Copy cdk/.env.example to cdk/.env and update the values to fit your needs. 

Then install CDK dependencies

```shell
cd cdk
npm install 
```

## Deployment

Preview the changes

```shell
make diff
```

Deploy the stack

```shell
make deploly
````

When the deployment is done, open WP_HOME to complete the normal WordPress setup process.

## Install Plugins and Themes

In this demo, WordPress code, plugins and themes are packaged in Lambda and are read-only. And we use Bedrock to manage WordPress plugins and themes. 
Check out [Bedrock documents](https://roots.io/bedrock/) on how to install/update wordpress plugins and themes. 
