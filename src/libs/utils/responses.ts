import { Response } from 'express';

const response = {
  sendSuccess: (res: Response, payload: any) => {
    res.status(200).send({
      status: 'SUCCESS',
      code: 200,
      message: payload.message || 'Resource found.',
      ...payload,
    });
  },

  sendCreated: (res: Response, payload: any) => {
    res.status(201).send({
      status: 'SUCCESS',
      code: 201,
      message: payload.message || 'Data created.',
      ...payload,
    });
  },

  sendBadRequest: (res: Response, message?: string) => {
    res.status(400).send({
      status: 'ERROR',
      code: 400,
      message: message || 'Bad Request.',
    });
  },

  sendNotFound: (res: Response, message?: string) => {
    res.status(404).send({
      status: 'ERROR',
      code: 404,
      message: message || 'Resource not found.',
    });
  },

  sendConflict: (res: Response, message?: string) => {
    res.status(409).send({
      status: 'CONFLICT',
      code: 409,
      message: message || 'There is a conflict.',
    });
  },

  sendInvalid: (res: Response, message?: string) => {
    res.status(422).send({
      status: 'ERROR',
      code: 422,
      message: message || 'Invalid attributes.',
    });
  },

  sendUnauthorized: (res: Response, message?: string) => {
    res.status(401).json({
      status: 'ERROR',
      code: 401,
      message: message || 'You are not authorized.',
    });
  },

  sendForbidden: (res: Response, message?: string) => {
    res.status(403).json({
      status: 'ERROR',
      code: 403,
      message: message || "You don't have access to request this site.",
    });
  },

  sendInternalError: (res: Response, errors?: any) => {
    res.status(500).send({
      status: 'ERROR',
      code: 500,
      message: 'Something Error.',
      errors,
    });
  },

  sendError: (res: Response, code: number, payload: any) => {
    res.status(code).json({
      status: payload?.status || 'ERROR',
      code,
      message: payload.message || 'Something failed.',
      data: payload?.data,
    });
  },
};

export default response;
  