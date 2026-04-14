import { Test, TestingModule } from '@nestjs/testing';
import { AppController } from './app.controller';
import { AppService } from './app.service';

describe('AppController', () => {
  let appController: AppController;

  beforeEach(async () => {
    const app: TestingModule = await Test.createTestingModule({
      controllers: [AppController],
      providers: [AppService],
    }).compile();

    appController = app.get<AppController>(AppController);
  });

  describe('root', () => {
    it('should return Safari Fast Group branding', () => {
      const res = appController.getHello();
      expect(res.product).toBe('Safari Fast Group ERP');
      expect(res.message).toContain('Safari Fast Group');
    });
  });
});
