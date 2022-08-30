import {
  Stack,
  StackProps,
  Duration,
  RemovalPolicy,
  aws_ec2 as ec2,
  aws_efs as efs,
  aws_lambda as lambda,
  aws_certificatemanager as acm,
  aws_elasticache as elasticache,
  aws_rds as rds,
  aws_s3 as s3,
  aws_route53 as route53,
  aws_route53_targets as route53targets,
  aws_cloudfront as cloudfront,
  aws_cloudfront_origins as origins,
  Lazy,
  CfnOutput,
  CfnResource,
  custom_resources as cr,
} from "aws-cdk-lib";
import { InstanceType } from "aws-cdk-lib/aws-ec2";
import { Construct } from "constructs";
import * as path from "path";

export class WooCommerceStack extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    // VPC
    const wcVPC = new ec2.Vpc(this, "vpc", {
      maxAzs: 2,
      natGateways: 1,
      gatewayEndpoints: {
        S3: {
          service: ec2.GatewayVpcEndpointAwsService.S3,
        },
      },
    });

    // default security group
    const wcDefaultSecurityGroup = ec2.SecurityGroup.fromSecurityGroupId(
      this,
      "defaultsg",
      wcVPC.vpcDefaultSecurityGroup
    );

    // Aurora Mysql Database
    const dbClusterInstanceCount: number = 1;
    const wcRdsCluster = new rds.DatabaseCluster(this, "Database", {
      engine: rds.DatabaseClusterEngine.auroraMysql({
        version: rds.AuroraMysqlEngineVersion.of(
          "8.0.mysql_aurora.3.02.0",
          "8.0"
        ),
      }),
      credentials: rds.Credentials.fromGeneratedSecret(
        this.node.tryGetContext("DB_USER")
      ),
      defaultDatabaseName: "wordpress",
      instances: dbClusterInstanceCount,
      instanceProps: {
        instanceType: new InstanceType("serverless"),
        securityGroups: [wcDefaultSecurityGroup],
        vpc: wcVPC,
        vpcSubnets: {
          subnetType: ec2.SubnetType.PRIVATE_WITH_NAT,
        },
      },
    });

    const serverlessV2ScalingConfiguration = {
      MinCapacity: 0.5,
      MaxCapacity: 32,
    };

    const dbScalingConfigure = new cr.AwsCustomResource(
      this,
      "DbScalingConfigure",
      {
        onCreate: {
          service: "RDS",
          action: "modifyDBCluster",
          parameters: {
            DBClusterIdentifier: wcRdsCluster.clusterIdentifier,
            ServerlessV2ScalingConfiguration: serverlessV2ScalingConfiguration,
          },
          physicalResourceId: cr.PhysicalResourceId.of(
            wcRdsCluster.clusterIdentifier
          ),
        },
        onUpdate: {
          service: "RDS",
          action: "modifyDBCluster",
          parameters: {
            DBClusterIdentifier: wcRdsCluster.clusterIdentifier,
            ServerlessV2ScalingConfiguration: serverlessV2ScalingConfiguration,
          },
          physicalResourceId: cr.PhysicalResourceId.of(
            wcRdsCluster.clusterIdentifier
          ),
        },
        policy: cr.AwsCustomResourcePolicy.fromSdkCalls({
          resources: cr.AwsCustomResourcePolicy.ANY_RESOURCE,
        }),
      }
    );

    const cfnDbCluster = wcRdsCluster.node.defaultChild as rds.CfnDBCluster;
    const dbScalingConfigureTarget = dbScalingConfigure.node.findChild(
      "Resource"
    ).node.defaultChild as CfnResource;

    cfnDbCluster.addPropertyOverride("EngineMode", "provisioned");
    dbScalingConfigure.node.addDependency(cfnDbCluster);

    for (let i = 1; i <= dbClusterInstanceCount; i++) {
      (
        wcRdsCluster.node.findChild(`Instance${i}`) as rds.CfnDBInstance
      ).addDependsOn(dbScalingConfigureTarget);
    }

    // remove database when the stack is deleted
    wcRdsCluster.applyRemovalPolicy(RemovalPolicy.DESTROY);

    // ElastiCache
    const wcCacheSubnetGroup = new elasticache.CfnSubnetGroup(
      this,
      "wcCacheSubnetGroup",
      {
        cacheSubnetGroupName: this.stackName + "-wcCacheSubnetGroup",
        description: "Cache Subnet Group for" + this.stackName,
        subnetIds: wcVPC.privateSubnets.map((subnet) => subnet.subnetId),
      }
    );

    const wcCacheCluster = new elasticache.CfnCacheCluster(
      this,
      "vwCacheCluster",
      {
        cacheNodeType: "cache.t3.micro",
        engine: "redis",
        numCacheNodes: 1,
        cacheSubnetGroupName: wcCacheSubnetGroup.cacheSubnetGroupName,
        vpcSecurityGroupIds: [wcDefaultSecurityGroup.securityGroupId],
      }
    );

    // remove the redis when the stack is deleted
    wcCacheCluster.applyRemovalPolicy(RemovalPolicy.DESTROY);

    wcCacheCluster.addDependsOn(wcCacheSubnetGroup);

    // S3 Bucket
    const wcBucket = new s3.Bucket(this, "bucket", {
      removalPolicy: RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
    });

    // efs file system
    const wcFileSystem = new efs.FileSystem(this, "fileSystem", {
      vpc: wcVPC,
      lifecyclePolicy: efs.LifecyclePolicy.AFTER_7_DAYS,
      performanceMode: efs.PerformanceMode.GENERAL_PURPOSE,
      securityGroup: wcDefaultSecurityGroup,
      removalPolicy: RemovalPolicy.DESTROY,
    });

    const wcEfsAccessPoint = wcFileSystem.addAccessPoint("accessPoint", {
      path: "/lambda",
      createAcl: {
        ownerGid: "1000",
        ownerUid: "1000",
        permissions: "750",
      },
      posixUser: {
        uid: "1000",
        gid: "1000",
      },
    });

    // Lambda Function
    const wcFunction = new lambda.DockerImageFunction(this, "woocommerce", {
      architecture: lambda.Architecture.X86_64,
      code: lambda.DockerImageCode.fromImageAsset(
        path.join(__dirname, "..", "..", "src")
      ),
      memorySize: 1024,
      timeout: Duration.seconds(300),
      vpc: wcVPC,
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_NAT },
      tracing: lambda.Tracing.ACTIVE,
      securityGroups: [wcDefaultSecurityGroup],
      filesystem: lambda.FileSystem.fromEfsAccessPoint(
        wcEfsAccessPoint,
        "/mnt/share"
      ),
      environment: {
        RUST_LOG: this.node.tryGetContext("RUST_LOG"),
        EFS_PATH: this.node.tryGetContext("EFS_PATH"),
        READINESS_CHECK_PATH: this.node.tryGetContext("READINESS_CHECK_PATH"),
        DB_HOST: wcRdsCluster.secret!.secretValueFromJson("host").toString(),
        DB_PORT: wcRdsCluster.secret!.secretValueFromJson("port").toString(),
        DB_USER: wcRdsCluster
          .secret!.secretValueFromJson("username")
          .toString(),
        DB_PASSWORD: wcRdsCluster
          .secret!.secretValueFromJson("password")
          .toString(),
        DB_NAME: wcRdsCluster.secret!.secretValueFromJson("dbname").toString(),
        WP_ENV: this.node.tryGetContext("WP_ENV"),
        WP_HOME: this.node.tryGetContext("WP_HOME"),
        WP_SITEURL: this.node.tryGetContext("WP_SITEURL"),
        DISABLE_WP_CRON: "false",
        AUTH_KEY: this.node.tryGetContext("AUTH_KEY"),
        SECURE_AUTH_KEY: this.node.tryGetContext("SECURE_AUTH_KEY"),
        LOGGED_IN_KEY: this.node.tryGetContext("LOGGED_IN_KEY"),
        NONCE_KEY: this.node.tryGetContext("NONCE_KEY"),
        AUTH_SALT: this.node.tryGetContext("AUTH_SALT"),
        SECURE_AUTH_SALT: this.node.tryGetContext("SECURE_AUTH_SALT"),
        LOGGED_IN_SALT: this.node.tryGetContext("LOGGED_IN_SALT"),
        NONCE_SALT: this.node.tryGetContext("NONCE_SALT"),
        S3_UPLOADS_BUCKET: wcBucket.bucketName,
        REDIS_CFG_ENDPOINT: wcCacheCluster.attrRedisEndpointAddress,
        REDIS_PORT: wcCacheCluster.attrRedisEndpointPort,
        REDIS_TIMEOUT: "1",
        REDIS_READ_TIMEOUT: "1",
        REDIS_DATABASE: "0",
        REDIS_DISABLED: "false",
      },
      currentVersionOptions: {
        removalPolicy: RemovalPolicy.RETAIN,
        retryAttempts: 1,
      },
    });

    // Lambda Alias
    const liveAlias = wcFunction.addAlias("live");
    // Add Lambda Function URL to this alias
    const wcFUrl = liveAlias.addFunctionUrl({
      authType: lambda.FunctionUrlAuthType.NONE,
    });

    // Grant Lambda read/write access to the s3 bucket
    wcBucket.grantReadWrite(wcFunction);
    wcBucket.grantPutAcl(wcFunction);

    // Route53 Domain
    const zoneName = this.node.tryGetContext("ROUTE53_HOSTEDZONE");
    const wcHostedZone = route53.HostedZone.fromLookup(this, "hostedzone", {
      domainName: zoneName,
    });

    // ACM Certification
    const wcDomainName = this.node.tryGetContext("ROUTE53_SITENAME");
    const wcCertificate = new acm.DnsValidatedCertificate(this, "certificate", {
      domainName: wcDomainName,
      hostedZone: wcHostedZone,
      region: "us-east-1",
    });

    // CloudFront
    const wcDefaultCachePolicy = new cloudfront.CachePolicy(
      this,
      "wcDefaultCachePolicy",
      {
        cachePolicyName: this.stackName + "-wcDefaultCachePolicy",
        comment: "default cache policy for " + this.stackName,
        defaultTtl: Duration.seconds(0),
        minTtl: Duration.seconds(0),
        maxTtl: Duration.days(365),
        queryStringBehavior: cloudfront.CacheQueryStringBehavior.all(),
        headerBehavior:
          cloudfront.CacheHeaderBehavior.allowList("Authorization"),
        cookieBehavior: cloudfront.CacheCookieBehavior.allowList(
          "wordpress_*",
          "wordpress_logged_in_*",
          "wp-settings-*",
          "wordpress_test_cookie",
          "comment_author_*",
          "comment_author_email_*",
          "comment_author_url_*"
        ),
        enableAcceptEncodingGzip: true,
        enableAcceptEncodingBrotli: true,
      }
    );
    const wcFUrlOriginRequestPolicy = new cloudfront.OriginRequestPolicy(
      this,
      "wcFUrlOriginRequestPolicy",
      {
        originRequestPolicyName: this.stackName + "-wcFUrlOriginRequestPolicy",
        comment: "api gateway origin request policy for " + this.stackName,
        queryStringBehavior: cloudfront.OriginRequestQueryStringBehavior.all(),
        headerBehavior: cloudfront.OriginRequestHeaderBehavior.allowList(
          "Accept",
          "Cache-Control",
          "Content-Encoding",
          "Content-Type",
          "Origin",
          "Referer",
          "User-Agent",
          "X-Forwarded-Host",
          "X-WP-Nonce"
        ),
        cookieBehavior: cloudfront.OriginRequestCookieBehavior.all(),
      }
    );

    const wcForwardedHostFunction = new cloudfront.Function(
      this,
      "wcForwardedHostFunction",
      {
        code: cloudfront.FunctionCode.fromInline(
          "function handler(event) { \
        var request = event.request; \
        request.headers['x-forwarded-host'] = {value: request.headers.host.value}; \
        return request; \
      }"
        ),
      }
    );

    const apiDomain = Lazy.uncachedString({
      produce: (context) => {
        const resolved = context.resolve(wcFUrl.url);
        return { "Fn::Select": [2, { "Fn::Split": ["/", resolved] }] } as any;
      },
    });

    const wcCFDistribution = new cloudfront.Distribution(this, "distribution", {
      domainNames: [wcDomainName],
      certificate: wcCertificate,
      comment: "Distribution for " + this.stackName,
      defaultBehavior: {
        origin: new origins.HttpOrigin(apiDomain, {
          readTimeout: Duration.seconds(60),
        }),
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        allowedMethods: cloudfront.AllowedMethods.ALLOW_ALL,
        cachedMethods: cloudfront.CachedMethods.CACHE_GET_HEAD_OPTIONS,
        cachePolicy: wcDefaultCachePolicy,
        originRequestPolicy: wcFUrlOriginRequestPolicy,
        compress: true,
        functionAssociations: [
          {
            function: wcForwardedHostFunction,
            eventType: cloudfront.FunctionEventType.VIEWER_REQUEST,
          },
        ],
      },
    });

    // Route53 record for Cloudfront Distribution
    const wcARecord = new route53.ARecord(this, "Alias", {
      zone: wcHostedZone,
      recordName: wcDomainName,
      target: route53.RecordTarget.fromAlias(
        new route53targets.CloudFrontTarget(wcCFDistribution)
      ),
    });

    new CfnOutput(this, "wp_home", {
      value: this.node.tryGetContext("WP_HOME"),
    });

    new CfnOutput(this, "lambda_furl", {
      value: wcFUrl.url,
    });
  }
}
