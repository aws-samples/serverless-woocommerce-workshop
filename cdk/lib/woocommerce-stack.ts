import {
  CfnParameter, Stack, StackProps, Duration, RemovalPolicy,
  aws_ec2 as ec2, aws_efs as efs, aws_lambda as lambda, aws_apigateway as apigateway, aws_certificatemanager as acm, aws_elasticache as elasticache,
  aws_rds as rds, aws_s3 as s3, aws_route53 as route53, aws_route53_targets as route53targets, aws_cloudfront as cloudfront, aws_cloudfront_origins as origins, SecretValue
} from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as path from 'path';


export class WooCommerceStack extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    // VPC
    const wcVPC = new ec2.Vpc(this,  'vpc', {
      gatewayEndpoints: {
        S3: {
          service: ec2.GatewayVpcEndpointAwsService.S3,
        },
      },
    });

    // default security group
    const wcDefaultSecurityGroup = ec2.SecurityGroup.fromSecurityGroupId(this, 'defaultsg', wcVPC.vpcDefaultSecurityGroup);

    // Aurora Mysql Database
    const wcRdsCluster = new rds.DatabaseCluster(this, 'database', {
      engine: rds.DatabaseClusterEngine.auroraMysql({ version: rds.AuroraMysqlEngineVersion.VER_2_08_1 }),
      credentials: rds.Credentials.fromGeneratedSecret(this.node.tryGetContext('DB_USER')),
      defaultDatabaseName: this.node.tryGetContext('DB_USER'),
      instanceProps: {
        instanceType: ec2.InstanceType.of(ec2.InstanceClass.R5, ec2.InstanceSize.XLARGE2),
        vpcSubnets: {
          subnetType: ec2.SubnetType.PRIVATE_WITH_NAT,
        },
        vpc: wcVPC,
        securityGroups: [wcDefaultSecurityGroup],
      },
    });

    // ElastiCache
    const wcCacheSubnetGroup = new elasticache.CfnSubnetGroup(this, 'wcCacheSubnetGroup', {
      cacheSubnetGroupName: this.stackName + '-wcCacheSubnetGroup',
      description: 'Cache Subnet Group for' + this.stackName,
      subnetIds: wcVPC.privateSubnets.map(subnet => subnet.subnetId),
    })

    const wcCacheCluster = new elasticache.CfnCacheCluster(this, 'vwCacheCluster', {
      cacheNodeType: 'cache.m6g.large',
      engine: 'memcached',
      numCacheNodes: 1,
      // azMode: 'cross-az',
      cacheSubnetGroupName: wcCacheSubnetGroup.cacheSubnetGroupName,
      vpcSecurityGroupIds: [wcDefaultSecurityGroup.securityGroupId]
    })

    wcCacheCluster.addDependsOn(wcCacheSubnetGroup)

    // S3 Bucket
    const wcBucket = new s3.Bucket(this, 'bucket');

    // Lambda Function
    const wcFunction = new lambda.DockerImageFunction(this, 'function', {
      code: lambda.DockerImageCode.fromImageAsset(path.join(__dirname, '..', '..', 'src')),
      memorySize: 2048,
      timeout: Duration.seconds(300),
      vpc: wcVPC,
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_NAT },
      tracing: lambda.Tracing.ACTIVE,
      securityGroups: [wcDefaultSecurityGroup],
      environment: {
        RUST_LOG: this.node.tryGetContext('RUST_LOG'),
        EFS_PATH: this.node.tryGetContext('EFS_PATH'),
        READINESS_CHECK_PATH: this.node.tryGetContext('READINESS_CHECK_PATH'),
        DB_HOST: wcRdsCluster.secret!.secretValueFromJson("host").toString(),
        DB_PORT: wcRdsCluster.secret!.secretValueFromJson("port").toString(),
        DB_USER: wcRdsCluster.secret!.secretValueFromJson("username").toString(),
        DB_PASSWORD: wcRdsCluster.secret!.secretValueFromJson("password").toString(),
        DB_NAME: wcRdsCluster.secret!.secretValueFromJson("dbname").toString(),
        WP_ENV: this.node.tryGetContext('WP_ENV'),
        WP_HOME: this.node.tryGetContext('WP_HOME'),
        WP_SITEURL: this.node.tryGetContext('WP_SITEURL'),
        AUTH_KEY: this.node.tryGetContext('AUTH_KEY'),
        SECURE_AUTH_KEY: this.node.tryGetContext('SECURE_AUTH_KEY'),
        LOGGED_IN_KEY: this.node.tryGetContext('LOGGED_IN_KEY'),
        NONCE_KEY: this.node.tryGetContext('NONCE_KEY'),
        AUTH_SALT: this.node.tryGetContext('AUTH_SALT'),
        SECURE_AUTH_SALT: this.node.tryGetContext('SECURE_AUTH_SALT'),
        LOGGED_IN_SALT: this.node.tryGetContext('LOGGED_IN_SALT'),
        NONCE_SALT: this.node.tryGetContext('NONCE_SALT'),
        S3_UPLOADS_BUCKET: wcBucket.bucketName,
        MEMCACHED_CFG_ENDPOINT: wcCacheCluster.attrConfigurationEndpointAddress,
        MEMCACHED_PORT: wcCacheCluster.attrConfigurationEndpointPort,
      },
      currentVersionOptions: {
        removalPolicy: RemovalPolicy.RETAIN,
        retryAttempts: 1,
      },
    });

    // Lambda Alias
    const liveAlias = wcFunction.currentVersion.addAlias('live');

    // Grant Lambda read/write access to the s3 bucket
    wcBucket.grantReadWrite(wcFunction);
    wcBucket.grantPutAcl(wcFunction);

    // API Gateway
    const stageName = 'live';
    const wcAPI = new apigateway.LambdaRestApi(this, 'api', {
      handler: liveAlias,
      binaryMediaTypes: ['*/*'],
      deployOptions: {
        stageName: stageName,
        tracingEnabled: true,
        loggingLevel: apigateway.MethodLoggingLevel.ERROR,
        dataTraceEnabled: false,
        metricsEnabled: false,
      },
      endpointConfiguration: {
        types: [apigateway.EndpointType.REGIONAL]
      },
    });


    // Route53 Domain
    const zoneName = this.node.tryGetContext('ROUTE53_HOSTEDZONE');
    const wcHostedZone = route53.HostedZone.fromLookup(this, 'hostedzone', {
      domainName: zoneName,
    });

    // ACM Certification
    const wcDomainName = this.node.tryGetContext('ROUTE53_SITENAME')
    const wcCertificate = new acm.DnsValidatedCertificate(this, "certificate", {
      domainName: wcDomainName,
      hostedZone: wcHostedZone,
      region: 'us-east-1',
    });

    // CloudFront
    const wcDefaultCachePolicy = new cloudfront.CachePolicy(this, 'wcDefaultCachePolicy', {
      cachePolicyName: this.stackName + '-wcDefaultCachePolicy',
      comment: 'default cache policy for ' + this.stackName,
      defaultTtl: Duration.seconds(0),
      minTtl: Duration.seconds(0),
      maxTtl: Duration.days(365),
      queryStringBehavior: cloudfront.CacheQueryStringBehavior.all(),
      headerBehavior: cloudfront.CacheHeaderBehavior.allowList('Authorization'),
      cookieBehavior: cloudfront.CacheCookieBehavior.allowList(
        'wordpress_*', 'wordpress_logged_in_*', 'wp-settings-*', 'wordpress_test_cookie',
        'comment_author_*', 'comment_author_email_*', 'comment_author_url_*'),
      enableAcceptEncodingGzip: true,
      enableAcceptEncodingBrotli: true,
    });
    const wcAPIGWOriginRequestPolicy = new cloudfront.OriginRequestPolicy(this, 'wcAPIGWOriginRequestPolicy', {
      originRequestPolicyName: this.stackName + '-wcAPIGWOriginRequestPolicy',
      comment: 'api gateway origin request policy for ' + this.stackName,
      queryStringBehavior: cloudfront.OriginRequestQueryStringBehavior.all(),
      headerBehavior: cloudfront.OriginRequestHeaderBehavior.allowList('Accept', 'Cache-Control', 'Content-Encoding',
        'Content-Type', 'Origin', 'Referer', 'User-Agent', 'X-Forwarded-Host', 'X-WP-Nonce'),
      cookieBehavior: cloudfront.OriginRequestCookieBehavior.all(),
    });
    const wcS3CachePolicy = new cloudfront.CachePolicy(this, 'wcS3CachePolicy', {
      cachePolicyName: this.stackName + '-wcS3CachePolicy',
      comment: 's3 cache policy for ' + this.stackName,
      defaultTtl: Duration.days(1),
      minTtl: Duration.seconds(0),
      maxTtl: Duration.days(7),
      queryStringBehavior: cloudfront.CacheQueryStringBehavior.allowList('ver'),
      headerBehavior: cloudfront.CacheHeaderBehavior.none(),
      cookieBehavior: cloudfront.CacheCookieBehavior.none(),
      enableAcceptEncodingGzip: true,
      enableAcceptEncodingBrotli: true,
    });
    const wcS3OriginRequestPolicy = new cloudfront.OriginRequestPolicy(this, 'wcS3OriginRequestPolicy', {
      originRequestPolicyName: this.stackName + '-wcS3OriginRequestPolicy',
      comment: 's3 origin request policy for ' + this.stackName,
      queryStringBehavior: cloudfront.OriginRequestQueryStringBehavior.none(),
      headerBehavior: cloudfront.OriginRequestHeaderBehavior.allowList('Origin', 'Access-Control-Request-Headers', 'Access-Control-Request-Method'),
      cookieBehavior: cloudfront.OriginRequestCookieBehavior.none(),
    });

    const wcForwardedHostFunction = new cloudfront.Function(this, 'wcForwardedHostFunction', {
      code: cloudfront.FunctionCode.fromInline(
        "function handler(event) { \
        var request = event.request; \
        request.headers['x-forwarded-host'] = {value: request.headers.host.value}; \
        return request; \
      }"),
    });

    const wcCFDistribution = new cloudfront.Distribution(this, 'distribution', {
      domainNames: [wcDomainName],
      certificate: wcCertificate,
      comment: 'Distribution for ' + this.stackName,
      defaultBehavior: {
        origin: new origins.HttpOrigin(wcAPI.url.substring("https://".length, wcAPI.url.indexOf("/", "https://".length)), {
          originPath: stageName,
          readTimeout: Duration.seconds(60)
        }),
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        allowedMethods: cloudfront.AllowedMethods.ALLOW_ALL,
        cachedMethods: cloudfront.CachedMethods.CACHE_GET_HEAD_OPTIONS,
        cachePolicy: wcDefaultCachePolicy,
        originRequestPolicy: wcAPIGWOriginRequestPolicy,
        compress: true,
        functionAssociations: [{
          function: wcForwardedHostFunction,
          eventType: cloudfront.FunctionEventType.VIEWER_REQUEST,
        }]
      },
      additionalBehaviors: {
        '/app/uploads/*': {
          origin: new origins.S3Origin(wcBucket),
          viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.ALLOW_ALL,
          allowedMethods: cloudfront.AllowedMethods.ALLOW_GET_HEAD_OPTIONS,
          cachedMethods: cloudfront.CachedMethods.CACHE_GET_HEAD_OPTIONS,
          cachePolicy: wcS3CachePolicy,
          originRequestPolicy: wcS3OriginRequestPolicy,
          compress: true,
        },
      },
    });

    // Route53 record for Cloudfront Distribution
    const wcARecord = new route53.ARecord(this, 'Alias', {
      zone: wcHostedZone,
      recordName: wcDomainName,
      target: route53.RecordTarget.fromAlias(new route53targets.CloudFrontTarget(wcCFDistribution)),
    });

  }
}
