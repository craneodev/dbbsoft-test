#!/usr/bin/env node
/**
 * CDK Application Entry Point
 * 
 * This is the main entry point for the AWS CDK application.
 * It initializes the CDK app and creates the stack that defines all AWS infrastructure.
 * 
 * The stack is deployed to the default AWS account and region configured in your AWS CLI.
 * These values are retrieved from environment variables set by the CDK CLI.
 */

import * as cdk from 'aws-cdk-lib/core';
import { DbbSoftTestStack } from '../lib/dbb_soft_test-stack';

// Initialize the CDK application
const app = new cdk.App();

// Create the main stack with environment configuration
// Uses CDK_DEFAULT_ACCOUNT and CDK_DEFAULT_REGION from AWS CLI configuration
new DbbSoftTestStack(app, 'DbbSoftTestStack', {
  env: { account: process.env.CDK_DEFAULT_ACCOUNT, region: process.env.CDK_DEFAULT_REGION },
});
