import { Injectable, NotFoundException } from '@nestjs/common';

import { Prisma, WebsiteOrderRequestStatus } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';

import { SerialCounterService } from '../serials/serial-counter.service';

import { CreatePublicOrderDto } from './dto/create-public-order.dto';



@Injectable()

export class WebsiteOrderRequestsService {

  constructor(

    private readonly prisma: PrismaService,

    private readonly serialCounter: SerialCounterService,

  ) {}



  private formatPublicReference(value: number): string {

    return `W-${String(value).padStart(5, '0')}`;

  }



  async createFromPublicRequest(dto: CreatePublicOrderDto) {

    const phone = dto.customerPhone.replace(/[\s-]/g, '').trim();



    return this.prisma.$transaction(async (tx) => {

      const existing = await tx.customer.findFirst({

        where: { OR: [{ phone }, { phone2: phone }] },

        select: { id: true },

      });



      const customerId =

        existing?.id ??

        (

          await tx.customer.create({

            data: {

              phone,

              displayName: dto.customerDisplayName?.trim() || null,

              address: dto.customerAddress?.trim() || null,

            },

            select: { id: true },

          })

        ).id;



      if (existing) {

        await tx.customer.update({

          where: { id: customerId },

          data: {

            displayName: dto.customerDisplayName?.trim() || undefined,

            address: dto.customerAddress?.trim() || undefined,

          },

        });

      }



      const next = await this.serialCounter.incrementCounter(

        tx,

        SerialCounterService.WEB_ORDER_REQUEST_KEY,

      );

      const publicReference = this.formatPublicReference(next);



      return tx.websiteOrderRequest.create({

        data: {

          publicReference,

          customerId,

          customerPhone: phone,

          customerDisplayName: dto.customerDisplayName?.trim() || null,

          customerAddress: dto.customerAddress?.trim() || null,

          serviceType: dto.serviceType,

          notes: dto.notes?.trim() || null,

          requestedItems:

            dto.requestedItems == null

              ? Prisma.JsonNull

              : (dto.requestedItems as unknown as Prisma.InputJsonValue),

        },

        select: {

          id: true,

          publicReference: true,

          status: true,

          createdAt: true,

        },

      });

    });

  }



  async listForCallCenter(status?: WebsiteOrderRequestStatus) {

    const requests = await this.prisma.websiteOrderRequest.findMany({

      where: status ? { status } : undefined,

      orderBy: { createdAt: 'desc' },

      take: 100,

      select: {

        id: true,

        publicReference: true,

        status: true,

        customerPhone: true,

        customerDisplayName: true,

        customerAddress: true,

        serviceType: true,

        notes: true,

        requestedItems: true,

        createdAt: true,

        reviewedAt: true,

        customer: {

          select: {

            id: true,

            displayName: true,

            phone: true,

            address: true,

          },

        },

        reviewedBy: {

          select: {

            id: true,

            fullName: true,

            safariRole: true,

          },

        },

      },

    });



    return {

      requests: requests.map((request) => ({

        id: request.id,

        publicReference: request.publicReference,

        status: request.status,

        customerPhone: request.customerPhone,

        customerDisplayName:

          request.customerDisplayName ?? request.customer?.displayName ?? null,

        customerAddress:

          request.customerAddress ?? request.customer?.address ?? null,

        serviceType: request.serviceType,

        notes: request.notes,

        requestedItems: request.requestedItems,

        createdAtIso: request.createdAt.toISOString(),

        reviewedAtIso: request.reviewedAt?.toISOString() ?? null,

        customerId: request.customer?.id ?? null,

        reviewedBy: request.reviewedBy

          ? {

              id: request.reviewedBy.id,

              fullName: request.reviewedBy.fullName,

              role: request.reviewedBy.safariRole,

            }

          : null,

      })),

    };

  }



  async updateStatus(

    id: string,

    status: WebsiteOrderRequestStatus,

    actorUserId: string,

  ) {

    const existing = await this.prisma.websiteOrderRequest.findUnique({

      where: { id },

      select: { id: true },

    });

    if (!existing) {

      throw new NotFoundException('Website order request not found');

    }

    const request = await this.prisma.websiteOrderRequest.update({

      where: { id },

      data: {

        status,

        reviewedByUserId: actorUserId,

        reviewedAt: new Date(),

      },

      select: {

        id: true,

        publicReference: true,

        status: true,

        reviewedAt: true,

      },

    });



    return {

      id: request.id,

      publicReference: request.publicReference,

      status: request.status,

      reviewedAtIso: request.reviewedAt?.toISOString() ?? null,

    };

  }

}


