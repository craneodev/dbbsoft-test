#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib/core';
import { DbbSoftTestStack } from '../lib/dbb_soft_test-stack';

const app = new cdk.App();
new DbbSoftTestStack(app, 'DbbSoftTestStack', {
  env: { account: process.env.CDK_DEFAULT_ACCOUNT, region: process.env.CDK_DEFAULT_REGION },
});
