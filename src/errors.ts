export class HttpError extends Error {
	status: number;

	constructor(status: number, message: string) {
		super(message);
		this.status = status;
	}
}

export class BadRequestError extends HttpError {
	constructor(message: string) {
		super(400, message);
	}
}

export class ConflictError extends HttpError {
	constructor(message: string) {
		super(409, message);
	}
}

export class NotFoundError extends HttpError {
	constructor(message: string) {
		super(404, message);
	}
}
