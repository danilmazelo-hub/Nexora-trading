import { Module } from '@nestjs/common';
import { DatabaseModule } from './infra/database/database.module';
import { HealthController } from './modules/health/health.controller';

@Module({
  imports: [DatabaseModule],
  controllers: [HealthController],
})
export class AppModule {}
