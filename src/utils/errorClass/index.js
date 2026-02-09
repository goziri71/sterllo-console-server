export class ErrorClass extends Error {
    constructor(message, statusCode) {
        super(message);
        this.statusCode = statusCode;
        this.status = `${statusCode}`.startsWith("4") ? "fails" : "error";
        Error.captureStackTrace(this, this.constructor)
    }
}




class school {
    constructor(name, type, yearFounded) {
        this.name = name;
        this.type = type;
        this.yearFounded = yearFounded;
    }

    getSchoolInfo() {
        return `The ${this.name} is a ${this.type} school founded in ${this.yearFounded}`;
    }
}

const school1 = new school("School of Science", "Science", 1990);
console.log(school1);