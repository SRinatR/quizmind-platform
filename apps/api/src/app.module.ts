import { Module } from '@nestjs/common';

import { PlatformController } from './platform.controller';
import { PlatformService } from './platform.service';
import { RequestLoggingInterceptor } from './request-logging.interceptor';
import { InfrastructureHealthService } from './services/infrastructure-health-service';

@Module({
  controllers: [PlatformController],
  providers: [PlatformService, RequestLoggingInterceptor, InfrastructureHealthService],
})
export class AppModule {}
