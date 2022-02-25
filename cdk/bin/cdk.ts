#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { WooCommerceStack } from '../lib/woocommerce-stack';

const app = new cdk.App();

const env_development = {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION,
};

new WooCommerceStack(app, 'WooCommerceStack', { env: env_development });