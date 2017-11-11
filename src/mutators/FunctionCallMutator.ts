import * as ts from 'typescript';
import { Mutator } from './Mutator';
import { Type, TypeChecker } from 'typescript';

export class FunctionCallMutator extends Mutator {

  protected kind = ts.SyntaxKind.CallExpression;

  protected mutate(node: any): ts.ObjectLiteralExpression | ts.CallExpression {
    console.log('node found: ', node);
    let checker = this.context.checker;
    if (node.expression.escapedText === 'getInterfaceDefinition') {
      const type = checker.getTypeAtLocation(node.typeArguments[0]);
      let members: Array<any> = [];
      type.symbol.members.forEach((key, member) => {
        members.push([key, member]);
      });
      return buildInterfaceObject(checker, getTypeDefinition2(type, checker));
    }
    return node;
  }
}

function buildInterfaceObject(checker: TypeChecker, obj: TypeValue2<any>): ts.ObjectLiteralExpression {
  for (const key in obj) {
    // @ts-ignore
    if (typeof obj[key] !== 'object') {
      // @ts-ignore
      fields.push(ts.createPropertyAssignment(key, ts.createLiteral(obj[key])));

    } else if (typeof obj[key] === 'list'){
      // @ts-ignore
      fields.push(ts.createPropertyAssignment(key, buildInterfaceObject(checker, obj[key])))
    }
  }
  // @ts-ignore
  return ts.createObjectLiteral(fields);
}

const getTypeDefinition2 = (
  typeObject: Type,
  checker: ts.TypeChecker,
): TypeValue2<any> => {

  if (typeObject.flags & ts.TypeFlags.BooleanLiteral) {
    return {
      type: "literal",
      // @ts-ignore
      value: typeObject.intrinsicName == "true" ? true : false,
    };
  } else if (typeObject.flags & (ts.TypeFlags.StringLiteral | ts.TypeFlags.NumberLiteral)) {
    return {
      type: "literal",
      // @ts-ignore
      value: typeObject.value,
    };
  } else if (typeObject.flags & ts.TypeFlags.Null) {
    return {
      type: "null",
    };
  } else if (typeObject.flags & ts.TypeFlags.String) {
    return {
      type: "string",
    };
  } else if (typeObject.flags & ts.TypeFlags.Number) {
    return {
      type: "number",
    };
  } else if (typeObject.flags & ts.TypeFlags.Union) {
    return {
      type: "union",
      // @ts-ignore
      subtypes: typeObject.types.map(subtype => getTypeDefinition2(subtype, checker)),
    };
  } else if (typeObject.flags & ts.TypeFlags.Object) {
    if (typeObject.symbol && typeObject.symbol.escapedName === "Array") {
      return {
        type: "list",
        // @ts-ignore
        subtype: getTypeDefinition2(
          // @ts-ignore
          typeObject.typeArguments[0],
          checker,
        )
      };
    }
    let subtypeObject = {};
    // @ts-ignore
    typeObject.symbol.members.forEach((value, key) => {
      // @ts-ignore
      subtypeObject[key.toString()] = getTypeDefinition2(
        checker.getTypeAtLocation(value.valueDeclaration),
        checker,
      );
    });

    return {
      type: "object",
      subtype: subtypeObject,
    };
  }

  throw new Error("Unable to handle type");
};

type TypeValue2<T> = {
  type: "literal",
  value: string | number | boolean,
} | {
  type: "number",
} | {
  type: "string",
} | {
  type: "boolean",
} | {
  type: "null",
} | {
  type: "list",
  subtype: TypeValue2<T>,
} | {
  type: "object",
  subtype: TypeDefinition2<T>,
} | {
  type: "union",
  subtypes: Array<TypeValue2<T>>,
};

type TypeDefinition2<T> = {
  [P in keyof T]: TypeValue2<T[P]>;
  };
