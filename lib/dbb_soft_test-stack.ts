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

    const vpc = ec2.Vpc.fromLookup(this, 'DefaultVPC', { isDefault: true });

    const mySecurityGroup = new ec2.SecurityGroup(this, 'WebSg', {
      vpc: vpc,
      description: 'Allow HTTP access',
      allowAllOutbound: true
    });

    mySecurityGroup.addIngressRule(ec2.Peer.anyIpv4(), ec2.Port.tcp(80), 'Allow HTTP traffic');

    const packageJsonPath = path.join(__dirname, '..', 'app', 'package.json');
    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
    const appVersion = packageJson.version;
    console.log(`🚀 Preparing to deploy version: ${appVersion}`);

    const repo = new ecr.Repository(this, 'MyWebAppRepo', {
      repositoryName: 'dbbsoftt-repo',
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      emptyOnDelete: true,
    });

    const dockerAsset = new assets.DockerImageAsset(this, 'MyWebAppImage', {
      directory: path.join(__dirname, '..', 'app'),
      platform: assets.Platform.LINUX_AMD64,
    });

    new ecrdeploy.ECRDeployment(this, 'DeployDockerImage', {
      src: new ecrdeploy.DockerImageName(dockerAsset.imageUri),
      dest: new ecrdeploy.DockerImageName(`${repo.repositoryUri}:${appVersion}`),
    });

    const appSourceZip = new s3assets.Asset(this, 'AppSourceZip', {
      path: path.join(__dirname, '..', 'app'),
    });

    const ebInstanceRole = new iam.Role(this, 'EBInstanceRole', {
      assumedBy: new iam.ServicePrincipal('ec2.amazonaws.com'),
    });
    ebInstanceRole.addManagedPolicy(iam.ManagedPolicy.fromAwsManagedPolicyName('AWSElasticBeanstalkWebTier'));
    ebInstanceRole.addManagedPolicy(iam.ManagedPolicy.fromAwsManagedPolicyName('AmazonEC2ContainerRegistryReadOnly'));

    const ebInstanceProfile = new iam.CfnInstanceProfile(this, 'EBInstanceProfile', {
      roles: [ebInstanceRole.roleName],
    });

    const app = new elasticbeanstalk.CfnApplication(this, 'MyEBApp', {
      applicationName: 'DbbSoft',
    });

    const appVersionProps = new elasticbeanstalk.CfnApplicationVersion(this, 'MyAppVersion', {
      applicationName: app.applicationName || 'DbbSoft',
      sourceBundle: {
        s3Bucket: appSourceZip.s3BucketName,
        s3Key: appSourceZip.s3ObjectKey,
      },
      description: `Version ${appVersion}`,
    });
    appVersionProps.addDependency(app);

    const env = new elasticbeanstalk.CfnEnvironment(this, 'MyEBEnv', {
      environmentName: 'DbbSoftEnv',
      applicationName: app.applicationName || 'DbbSoft',
      solutionStackName: '64bit Amazon Linux 2023 v4.8.0 running Docker',

      versionLabel: appVersionProps.ref,

      optionSettings: [

        { namespace: 'aws:ec2:vpc', optionName: 'VPCId', value: vpc.vpcId },
        { namespace: 'aws:ec2:vpc', optionName: 'Subnets', value: vpc.publicSubnets.map(s => s.subnetId).join(',') },
        { namespace: 'aws:ec2:vpc', optionName: 'AssociatePublicIpAddress', value: 'true' },


        { namespace: 'aws:autoscaling:launchconfiguration', optionName: 'IamInstanceProfile', value: ebInstanceProfile.ref },
        { namespace: 'aws:autoscaling:launchconfiguration', optionName: 'InstanceType', value: 't3.micro' },
        { namespace: 'aws:autoscaling:launchconfiguration', optionName: 'SecurityGroups', value: mySecurityGroup.securityGroupId },
        { namespace: 'aws:elasticbeanstalk:environment', optionName: 'EnvironmentType', value: 'SingleInstance' },


        {
          namespace: 'aws:elasticbeanstalk:application:environment',
          optionName: 'AWS_EB_DOCKER_IMAGE_URI',
          value: `${repo.repositoryUri}:${appVersion}`,
        },
      ],
    });
  }
}