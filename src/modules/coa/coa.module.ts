import { Module } from '@nestjs/common';
import { CoaController } from './coa.controller';
import { CoaService } from './coa.service';
import { PrismaModule } from '../../shared/prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [CoaController],
  providers: [CoaService],
  exports: [CoaService],
})
export class CoaModule {}