/**
 * AWS Infrastructure Stack for DBB Software Test Application
 * 
 * This stack defines the complete AWS infrastructure using Infrastructure as Code (IaC).
 * It includes:
 * - ECR repository for Docker image storage
 * - Elastic Beanstalk application and environment for container orchestration
 * - VPC networking with security groups
 * - IAM roles and policies for secure access
 * - Automated Docker image deployment to ECR
 * 
 * The stack follows AWS best practices for security, scalability, and maintainability.
 */

import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as ecr from 'aws-cdk-lib/aws-ecr';
import * as elasticbeanstalk from 'aws-cdk-lib/aws-elasticbeanstalk';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as assets from 'aws-cdk-lib/aws-ecr-assets';
import * as s3assets from 'aws-cdk-lib/aws-s3-assets';
import * as path from 'path';
import * as ecrdeploy from 'cdk-ecr-deployment';
import * as fs from 'fs';

export class DbbSoftTestStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // ==========================================
    // NETWORKING CONFIGURATION
    // ==========================================

    /**
     * Use the default VPC in the AWS account
     * This avoids creating a new VPC and associated costs while meeting the requirements
     */
    const vpc = ec2.Vpc.fromLookup(this, 'DefaultVPC', { isDefault: true });

    /**
     * Security Group for Web Application
     * 
     * Defines firewall rules for the Elastic Beanstalk EC2 instances:
     * - Allows inbound HTTP traffic on port 80 from any IP (for public access)
     * - Allows all outbound traffic (for package installation, ECR pulls, etc.)
     * 
     * Note: Traffic on port 80 is automatically forwarded to container port 8080
     * by Elastic Beanstalk configuration
     */
    const mySecurityGroup = new ec2.SecurityGroup(this, 'WebSg', {
      vpc: vpc,
      description: 'Allow HTTP access',
      allowAllOutbound: true
    });

    // Allow HTTP traffic from anywhere (0.0.0.0/0)
    mySecurityGroup.addIngressRule(ec2.Peer.anyIpv4(), ec2.Port.tcp(80), 'Allow HTTP traffic');

    // ==========================================
    // SEMANTIC VERSIONING
    // ==========================================

    /**
     * Read application version from package.json
     * 
     * This implements semantic versioning across the entire deployment:
     * - Docker images are tagged with this version (not 'latest')
     * - Elastic Beanstalk application versions use this tag
     * - CI/CD pipeline increments this version automatically
     * 
     * Benefits:
     * - Immutable deployments (each version has a unique tag)
     * - Easy rollbacks (can redeploy any previous version)
     * - Clear deployment history
     */
    const packageJsonPath = path.join(__dirname, '..', 'app', 'package.json');
    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
    const appVersion = packageJson.version;
    console.log(`🚀 Preparing to deploy version: ${appVersion}`);

    // ==========================================
    // DOCKER CONTAINER REGISTRY (ECR)
    // ==========================================

    /**
     * Create ECR Repository for Docker Images
     * 
     * This repository stores all versions of the Docker container image.
     * Configuration:
     * - removalPolicy: DESTROY - automatically delete repository when stack is destroyed
     * - emptyOnDelete: true - delete all images before removing the repository
     * 
     * Note: For production, consider changing removalPolicy to RETAIN to preserve images
     */
    const repo = new ecr.Repository(this, 'MyWebAppRepo', {
      repositoryName: 'dbbsoftt-repo',
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      emptyOnDelete: true,
    });

    /**
     * Build Docker Image as CDK Asset
     * 
     * CDK automatically:
     * 1. Builds the Docker image from the Dockerfile in the 'app' directory
     * 2. Pushes it to a temporary ECR repository managed by CDK
     * 3. Makes it available for deployment
     * 
     * Platform is set to LINUX_AMD64 to ensure compatibility with Elastic Beanstalk instances
     */
    const dockerAsset = new assets.DockerImageAsset(this, 'MyWebAppImage', {
      directory: path.join(__dirname, '..', 'app'),
      platform: assets.Platform.LINUX_AMD64,
    });

    /**
     * Deploy Docker Image to Target ECR Repository
     * 
     * This copies the built Docker image from CDK's temporary repository
     * to our application's ECR repository with the version tag from package.json.
     * 
     * Flow:
     * 1. CDK builds image and pushes to temporary ECR (dockerAsset.imageUri)
     * 2. ECRDeployment copies it to our repo with version tag (e.g., 1.0.0)
     * 3. Elastic Beanstalk pulls from our repo using this version tag
     */
    new ecrdeploy.ECRDeployment(this, 'DeployDockerImage', {
      src: new ecrdeploy.DockerImageName(dockerAsset.imageUri),
      dest: new ecrdeploy.DockerImageName(`${repo.repositoryUri}:${appVersion}`),
    });

    // ==========================================
    // ELASTIC BEANSTALK SOURCE BUNDLE
    // ==========================================

    /**
     * Create S3 Asset from Application Directory
     * 
     * Elastic Beanstalk requires a source bundle (ZIP file) that contains:
     * - Dockerrun.aws.json or docker-compose.yml (to specify which Docker image to run)
     * - Any additional configuration files
     * 
     * CDK automatically:
     * 1. Zips the 'app' directory
     * 2. Uploads it to an S3 bucket
     * 3. Provides the S3 location to Elastic Beanstalk
     * 
     * The docker-compose.yml in the app directory references the ECR image URI
     */
    const appSourceZip = new s3assets.Asset(this, 'AppSourceZip', {
      path: path.join(__dirname, '..', 'app'),
    });

    // ==========================================
    // IAM ROLES AND PERMISSIONS
    // ==========================================

    /**
     * Create IAM Role for Elastic Beanstalk EC2 Instances
     * 
     * This role grants the EC2 instances permission to:
     * 1. Perform standard Elastic Beanstalk operations (via AWSElasticBeanstalkWebTier)
     *    - Upload logs to CloudWatch
     *    - Report health status
     *    - Access Elastic Beanstalk APIs
     * 
     * 2. Pull Docker images from ECR (via AmazonEC2ContainerRegistryReadOnly)
     *    - Authenticate with ECR
     *    - Download container images
     * 
     * The role follows the principle of least privilege - only granting necessary permissions
     */
    const ebInstanceRole = new iam.Role(this, 'EBInstanceRole', {
      assumedBy: new iam.ServicePrincipal('ec2.amazonaws.com'),
    });
    ebInstanceRole.addManagedPolicy(iam.ManagedPolicy.fromAwsManagedPolicyName('AWSElasticBeanstalkWebTier'));
    ebInstanceRole.addManagedPolicy(iam.ManagedPolicy.fromAwsManagedPolicyName('AmazonEC2ContainerRegistryReadOnly'));

    /**
     * Create Instance Profile
     * 
     * Instance Profile is an AWS construct that wraps the IAM role
     * and makes it attachable to EC2 instances.
     * Required by Elastic Beanstalk to assign permissions to instances.
     */
    const ebInstanceProfile = new iam.CfnInstanceProfile(this, 'EBInstanceProfile', {
      roles: [ebInstanceRole.roleName],
    });

    // ==========================================
    // ELASTIC BEANSTALK APPLICATION
    // ==========================================

    /**
     * Create Elastic Beanstalk Application
     * 
     * The Application is a logical container that can have multiple environments
     * (e.g., dev, staging, production). Here we create one application called "DbbSoft"
     * with a single environment for the test deployment.
     */
    const app = new elasticbeanstalk.CfnApplication(this, 'MyEBApp', {
      applicationName: 'DbbSoft',
    });

    /**
     * Create Application Version
     * 
     * Each deployment to Elastic Beanstalk creates a new "Application Version".
     * This version references:
     * - The S3 location of the source bundle (docker-compose.yml + configs)
     * - A version description using semantic versioning from package.json
     * 
     * Benefits:
     * - Version history is maintained in Elastic Beanstalk console
     * - Easy rollback to previous versions via console or CLI
     * - Clear audit trail of deployments
     */
    const appVersionProps = new elasticbeanstalk.CfnApplicationVersion(this, 'MyAppVersion', {
      applicationName: app.applicationName || 'DbbSoft',
      sourceBundle: {
        s3Bucket: appSourceZip.s3BucketName,
        s3Key: appSourceZip.s3ObjectKey,
      },
      description: `Version ${appVersion}`,
    });
    // Ensure application is created before the version
    appVersionProps.addDependency(app);

    // ==========================================
    // ELASTIC BEANSTALK ENVIRONMENT
    // ==========================================

    /**
     * Create Elastic Beanstalk Environment
     * 
     * The Environment is where the application actually runs. It provisions and manages:
     * - EC2 instances running Docker containers
     * - Load balancers (if using LoadBalanced environment type)
     * - Auto-scaling groups
     * - CloudWatch monitoring and logging
     * 
     * Solution Stack: Amazon Linux 2023 with Docker support
     * This is the latest platform that supports Docker container deployments
     */
    const env = new elasticbeanstalk.CfnEnvironment(this, 'MyEBEnv', {
      environmentName: 'DbbSoftEnv',
      applicationName: app.applicationName || 'DbbSoft',
      solutionStackName: '64bit Amazon Linux 2023 v4.8.0 running Docker',

      // Deploy the application version created above
      versionLabel: appVersionProps.ref,

      /**
       * Option Settings - Fine-grained Configuration
       * 
       * These settings control every aspect of the Elastic Beanstalk environment.
       * They are organized by namespace (category) and include:
       */
      optionSettings: [

        // === VPC AND NETWORKING CONFIGURATION ===

        // Deploy in the default VPC
        { namespace: 'aws:ec2:vpc', optionName: 'VPCId', value: vpc.vpcId },

        // Use public subnets so instances get public IPs and are accessible from internet
        { namespace: 'aws:ec2:vpc', optionName: 'Subnets', value: vpc.publicSubnets.map(s => s.subnetId).join(',') },

        // Assign public IP addresses to EC2 instances for direct internet access
        { namespace: 'aws:ec2:vpc', optionName: 'AssociatePublicIpAddress', value: 'true' },


        // === EC2 INSTANCE CONFIGURATION ===

        // Attach the IAM instance profile for ECR and CloudWatch permissions
        { namespace: 'aws:autoscaling:launchconfiguration', optionName: 'IamInstanceProfile', value: ebInstanceProfile.ref },

        // Use t3.micro for cost optimization (suitable for test/demo applications)
        // For production, consider t3.small or larger depending on traffic
        { namespace: 'aws:autoscaling:launchconfiguration', optionName: 'InstanceType', value: 't3.micro' },

        // Attach the security group that allows HTTP traffic on port 80
        { namespace: 'aws:autoscaling:launchconfiguration', optionName: 'SecurityGroups', value: mySecurityGroup.securityGroupId },

        // SingleInstance: One EC2 instance without load balancer (cost-effective for testing)
        // For production with high availability, use 'LoadBalanced' instead
        { namespace: 'aws:elasticbeanstalk:environment', optionName: 'EnvironmentType', value: 'SingleInstance' },


        // === DOCKER IMAGE CONFIGURATION ===

        /**
         * Pass the ECR image URI as an environment variable
         * 
         * This is used by docker-compose.yml to pull the correct image version.
         * The image URI includes the repository URL and version tag (e.g., 123456789.dkr.ecr.us-east-1.amazonaws.com/dbbsoftt-repo:1.0.0)
         * 
         * Flow:
         * 1. CDK passes this URI as an environment variable to the EB environment
         * 2. docker-compose.yml reads this variable: image: ${AWS_EB_DOCKER_IMAGE_URI}
         * 3. Docker pulls the specified image from ECR
         * 4. Container starts with the application code
         */
        {
          namespace: 'aws:elasticbeanstalk:application:environment',
          optionName: 'AWS_EB_DOCKER_IMAGE_URI',
          value: `${repo.repositoryUri}:${appVersion}`,
        },
      ],
    });
  }
}