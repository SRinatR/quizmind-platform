import { Module } from '@nestjs/common';

import { PlatformController } from './platform.controller';
import { PlatformService } from './platform.service';
import { RequestLoggingInterceptor } from './request-logging.interceptor';

@Module({
  controllers: [PlatformController],
  providers: [PlatformService, RequestLoggingInterceptor],
})
export class AppModule {}
