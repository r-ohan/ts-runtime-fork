import * as ts from 'typescript';
import * as util from './util';
import { MutationContext } from './context';

export enum ReflectionContext {
  None,
  Return
}

export class Factory {

  private _context: MutationContext;
  private _strictNullChecks: boolean;
  private _lib: string;
  private _namespace: string;
  private _load: string;
  private _reflectionContext: ReflectionContext;

  // TODO: check ts.SyntaxKind.QualifiedName (e.g. B.One if B is an enum)

  constructor(context: MutationContext, strictNullChecks = false, lib = 't', namespace = '_', load = 'ts-runtime/lib') {
    this._context = context;
    this._lib = lib;
    this._namespace = namespace;
    this._strictNullChecks = strictNullChecks;
    this._load = load;
    this._reflectionContext = undefined;
  }

  public typeReflection(node: ts.TypeNode, reflectionContext: ReflectionContext = ReflectionContext.None): ts.Expression {
    this._reflectionContext = reflectionContext;

    if (!node) {
      return this.anyTypeReflection();
    }

    switch (node.kind) {
      case ts.SyntaxKind.ParenthesizedType:
        return this.typeReflection((node as ts.ParenthesizedTypeNode).type);
      case ts.SyntaxKind.AnyKeyword:
        return this.anyTypeReflection();
      case ts.SyntaxKind.NumberKeyword:
        return this.numberTypeReflection();
      case ts.SyntaxKind.BooleanKeyword:
        return this.booleanTypeReflection();
      case ts.SyntaxKind.StringKeyword:
        return this.stringTypeReflection();
      case ts.SyntaxKind.SymbolKeyword:
        return this.symbolTypeReflection();
      case ts.SyntaxKind.ObjectKeyword:
        return this.objectTypeReflection();
      case ts.SyntaxKind.VoidKeyword:
        return this.voidTypeReflection();
      case ts.SyntaxKind.NullKeyword:
        return this.nullTypeReflection();
      case ts.SyntaxKind.UndefinedKeyword:
        return this.undefinedTypeReflection();
      case ts.SyntaxKind.ThisType:
        return this.thisTypeReflection();
      case ts.SyntaxKind.LiteralType:
        return this.literalTypeReflection(node as ts.LiteralTypeNode);
      case ts.SyntaxKind.ArrayType:
        return this.arrayTypeReflection(node as ts.ArrayTypeNode);
      case ts.SyntaxKind.TupleType:
        return this.tupleTypeReflection(node as ts.TupleTypeNode);
      case ts.SyntaxKind.UnionType:
        return this.unionTypeReflection(node as ts.UnionTypeNode);
      case ts.SyntaxKind.IntersectionType:
        return this.intersectionTypeReflection(node as ts.IntersectionTypeNode);
      case ts.SyntaxKind.TypeReference:
        return this.typeReferenceReflection(node as ts.TypeReferenceNode);
      case ts.SyntaxKind.FunctionType:
        return this.functionTypeReflection(node as ts.FunctionTypeNode);
      case ts.SyntaxKind.ConstructorType:
        return this.constructorTypeReflection(node as ts.ConstructorTypeNode);
      case ts.SyntaxKind.TypeLiteral:
        return this.typeLiteralReflection(node as ts.TypeLiteralNode);
      case ts.SyntaxKind.TypeQuery:
        return this.typeQueryReflection(node as ts.TypeQueryNode);
      case ts.SyntaxKind.TypeParameter: // generics // TODO: implement
      case ts.SyntaxKind.TypePredicate: // function a(pet: Fish | Bird) pet is Fish // TODO: implement
      case ts.SyntaxKind.MappedType: // TODO: implement
      // type Readonly<T> = {
      //   readonly [P in keyof T]: T[P];
      // }
      case ts.SyntaxKind.IndexedAccessType: // TODO: implement
      case ts.SyntaxKind.ExpressionWithTypeArguments: // TODO: implement (extends SomeType)
      case ts.SyntaxKind.TypeOperator: // TODO: implement
      default:
        throw new Error(`No reflection for syntax kind '${ts.SyntaxKind[node.kind]}' found.`);
    }
  }

  // public getImplicitTypeNodeOrOriginal(node: ts.TypeNode): ts.TypeNode {
  //   const original = node;
  //
  //   node = this.context.getImplicitTypeNode(node);
  //
  //   if (node.kind !== original.kind) {
  //     node = original;
  //   }
  //
  //   return node;
  // }

  public typeAliasReflection(name: string | ts.Identifier, args: ts.Expression | ts.Expression[], keyword = 'type'): ts.Expression {
    args = util.asArray(args);
    args.unshift(ts.createLiteral(name as any));
    return this.libCall(keyword, args);
  }

  public classReflection(node: ts.ClassDeclaration): ts.Expression {
    let args = util.asArray(this.typeLiteralReflection(node));
    return this.typeAliasReflection(node.name, args, 'class');
  }

  // public typeReflection(node: ts.InterfaceDeclaration | ts.ClassDeclaration | ts.LiteralType): ts.Expression {
  //   let typeAliasExpressions: ts.Expression = this.asObject(
  //     this.mergedElementsReflection(
  //       this.getProperties(node) as ts.TypeElement[] | ts.ClassElement[]
  //     )
  //   );
  //
  //   if (this.context.hasSelfReference(node)) {
  //     typeAliasExpressions = this.selfReference(node.name, typeAliasExpressions);
  //   }
  //
  //   return typeAliasExpressions;
  // }

  // TODO: handle ComputedPropertyName
  public typeLiteralReflection(node: ts.InterfaceDeclaration | ts.ClassDeclaration | ts.TypeLiteralNode): ts.Expression {
    switch (node.kind) {
      case ts.SyntaxKind.InterfaceDeclaration:
      case ts.SyntaxKind.ClassDeclaration:
        const elements = this.getProperties(node) as ts.TypeElement[] | ts.ClassElement[];

        if (node.kind === ts.SyntaxKind.ClassDeclaration) {
          for (let member of node.members) {
            if (util.isStaticClassElement(member)) {
              (elements as (ts.TypeElement | ts.ClassElement)[]).push(member)
            }
            if (member.kind === ts.SyntaxKind.IndexSignature) {
              (elements as (ts.TypeElement | ts.ClassElement)[]).unshift(member)
            }
          }
        }

        let reflection: ts.Expression = this.asObject(
          this.elementsReflection(elements)
        );

        let args = [reflection];

        if (node.kind === ts.SyntaxKind.ClassDeclaration) {
          const implementsClause = util.getImplementsClause(node);
          const extendsClause = util.getExtendsClause(node);

          if (implementsClause && implementsClause.types && implementsClause.types.length > 0) {
            args = util.asArray(this.intersect([...implementsClause.types.map(t => t.expression as ts.Expression), ...args]));
          }

          if (extendsClause && extendsClause.types && extendsClause.types.length > 0) {
            args.unshift(this.libCall('extends', extendsClause.types[0].expression));
          }
        }

        if (node.kind as ts.SyntaxKind !== ts.SyntaxKind.TypeLiteral) {
          const hasSelfReference = this.context.hasSelfReference(node);
          const hasTypeParameters = node.typeParameters && node.typeParameters.length > 0;

          if (hasSelfReference || hasTypeParameters) {
            if (hasTypeParameters) {

              const statements: ts.Statement[] = [];
              const nodeName = node.name.getText();

              for (let typeParameter of node.typeParameters) {
                statements.push(this.typeParameterDeclaration(typeParameter, nodeName));
              }

              statements.push(ts.createReturn(ts.createArrayLiteral(args)));

              const block = ts.createBlock(statements, true);

              reflection = this.selfReference(node.name, block);
            } else {
              reflection = this.selfReference(node.name, ts.createArrayLiteral(args));
            }
          }
        }

        return reflection;
      case ts.SyntaxKind.TypeLiteral:
        return this.nullable(this.libCall('object', this.elementsReflection(node.members)));
      default:
        throw new Error(`No possible type literal reflection for ${ts.SyntaxKind[(node as any).kind]} found.`);
    }
  }

  public typeParameterReflection(typeParameter: ts.TypeParameterDeclaration, prop = this.lib): ts.Expression {
    const args: ts.Expression[] = [
      ts.createLiteral(typeParameter.name)
    ];

    if (typeParameter.constraint) {
      args.push(this.typeReflection(typeParameter.constraint))
    }

    if (typeParameter.default) {
      if (!typeParameter.constraint) {
        args.push(ts.createVoidZero());
      }

      args.push(this.typeReflection(typeParameter.default))
    }

    return this.propertyAccessCall(prop, 'typeParameter', args);
  }

  public typeParameterDeclaration(typeParameter: ts.TypeParameterDeclaration, prop = this.lib): ts.Statement {
    const callExpression = this.typeParameterReflection(typeParameter, prop);
    return ts.createVariableStatement(undefined, ts.createVariableDeclarationList([ts.createVariableDeclaration(typeParameter.name, undefined, callExpression)], ts.NodeFlags.Const));
  }

  // TODO: handle ComputedPropertyName
  //   public typeLiteralReflection(node: ts.TypeLiteralNode): ts.Expression {
  //   return this.nullable(this.libCall('object', this.elementsReflection(node.members)));
  // }

  // public interfaceReflection(name: string | ts.Identifier, args: ts.Expression | ts.Expression[]): ts.Expression {
  //   return this.typeAliasReflection(name, args);
  // }

  // public interfaceSubstitution(node: ts.InterfaceDeclaration): ts.Expression {
  //   return this.propertyAccessCall(this.lib, 'type', [
  //     ts.createLiteral(node.name),
  //     this.nullable(this.libCall('object', this.typeElementsReflection(node.members)))
  //   ])
  // }

  public typeDeclaration(name: string | ts.Identifier | ts.ObjectBindingPattern | ts.ArrayBindingPattern, node: ts.TypeNode): ts.VariableDeclaration {
    return ts.createVariableDeclaration(name, undefined, this.typeReflection(node));
  }

  public typeAssertion(id: string | ts.Expression, args: ts.Expression | ts.Expression[] = []): ts.CallExpression {
    return this.propertyAccessCall(id, 'assert', args);
  }

  public typeReflectionAndAssertion(node: ts.TypeNode, args: ts.Expression | ts.Expression[] = []): ts.CallExpression {
    return this.typeAssertion(this.typeReflection(node), args);
  }

  public anyTypeReflection(): ts.Expression {
    return this.libCall('any');
  }

  public numberTypeReflection(): ts.Expression {
    return this.nullable(this.libCall('number'));
  }

  public booleanTypeReflection(): ts.Expression {
    return this.nullable(this.libCall('boolean'));
  }

  public stringTypeReflection(): ts.Expression {
    return this.nullable(this.libCall('string'));
  }

  public symbolTypeReflection(): ts.Expression {
    return this.nullable(this.libCall('symbol'));
  }

  public objectTypeReflection(): ts.Expression {
    return this.nullable(this.libCall('object'));
  }

  public voidTypeReflection(): ts.Expression {
    return this.libCall('void');
    // return this.libCall('union', [this.libCall('null'), this.libCall('void')]);
  }

  public nullTypeReflection(): ts.Expression {
    return this.libCall('null');
  }

  public undefinedTypeReflection(): ts.Expression {
    return this.nullable(this.libCall('undef'));
  }

  public thisTypeReflection(): ts.Expression {
    return this.nullable(this.libCall('this', ts.createThis()));
  }

  public literalTypeReflection(node: ts.LiteralTypeNode): ts.Expression {
    switch (node.literal.kind) {
      case ts.SyntaxKind.TrueKeyword:
      case ts.SyntaxKind.FalseKeyword:
        return this.booleanLiteralTypeReflection(node);
      case ts.SyntaxKind.StringLiteral:
        return this.stringLiteralTypeReflection(node);
      case ts.SyntaxKind.NumericLiteral:
        return this.numericLiteralTypeReflection(node);
      case ts.SyntaxKind.ComputedPropertyName:
      default:
        throw new Error(`No literal type reflection for syntax kind '${ts.SyntaxKind[node.literal.kind]}' found.`);
    }
  }

  public booleanLiteralTypeReflection(node: ts.LiteralTypeNode): ts.Expression {
    return this.nullable(this.libCall('boolean', ts.createLiteral(
      node.literal.kind === ts.SyntaxKind.TrueKeyword ? true : false
    )));
  }

  public numericLiteralTypeReflection(node: ts.LiteralTypeNode): ts.Expression {
    return this.nullable(this.libCall('number', ts.createNumericLiteral(node.literal.getText())));
  }

  public stringLiteralTypeReflection(node: ts.LiteralTypeNode): ts.Expression {
    const str = node.literal.getText();
    return this.nullable(this.libCall('string', ts.createLiteral(str.substring(1, str.length - 1))));
  }

  public arrayTypeReflection(node: ts.ArrayTypeNode): ts.Expression {
    return this.nullable(this.libCall('array', this.typeReflection(node.elementType)));
  }

  public tupleTypeReflection(node: ts.TupleTypeNode): ts.Expression {
    return this.nullable(this.libCall('tuple', node.elementTypes.map(n => this.typeReflection(n))));
  }

  public unionTypeReflection(node: ts.UnionTypeNode): ts.Expression {
    return this.nullable(this.libCall('union', node.types.map(n => this.typeReflection(n))));
  }

  public intersectionTypeReflection(node: ts.IntersectionTypeNode): ts.Expression {
    return this.nullable(this.libCall('intersection', node.types.map(n => this.typeReflection(n))));
  }

  // TODO: handle enums (annotate like functions?)
  public typeReferenceReflection(node: ts.TypeReferenceNode): ts.Expression {
    let keyword = 'array';

    let asLiteral = false;
    const scanner = this.context.scanner;
    const nodeAttributes = scanner.getAttributes(node);

    if (nodeAttributes.isTypeNode && nodeAttributes.typeAttributes.TSR_DECLARATION) {
      asLiteral = true;
    }

    const typeNameText: string = node.typeName.getText();
    const args: ts.Expression[] = !node.typeArguments ? [] : node.typeArguments.map(n => this.typeReflection(n));

    let isTypeParameter: boolean;
    let isClassTypeParameter: boolean;
    let isReturnContext: boolean;
    let classTypeParameterReflection: ts.Expression;

    if (typeNameText.toLowerCase() !== 'array') {
      let identifier: ts.Expression = asLiteral ? ts.createLiteral(typeNameText) : ts.createIdentifier(typeNameText);

      isTypeParameter = util.isTypeParameter(node);
      isClassTypeParameter = false;
      isReturnContext = this.reflectionContext === ReflectionContext.Return;

      // TODO: check if self-referencing
      // TODO: no tdz if exists
      if (!isTypeParameter && !asLiteral && !this.context.wasDeclared(node.typeName)) {
        identifier = this.tdz(identifier as ts.Identifier);
      }

      keyword = 'ref';

      if (isTypeParameter) {
        const parentClass = util.isTypeParameterOfClass(node);

        if (parentClass !== null) {
          isClassTypeParameter = true;
          classTypeParameterReflection = this.flowInto(
                  ts.createPropertyAccess(
                    ts.createElementAccess(
                      ts.createThis(),
                      ts.createIdentifier(this.context.getTypeSymbolDeclarationName(parentClass.name))
                    ),
                    typeNameText
                  )
              );
        } else if (!isReturnContext) {
          keyword = 'flowInto';
        }
      }

      // if (isTypeParameter && !isReturnContext) {
      //   keyword = 'flowInto';
      // }

      args.unshift(identifier);
    }

    return this.nullable(isClassTypeParameter ? classTypeParameterReflection : isTypeParameter && isReturnContext ? args[0] : this.libCall(keyword, args));
  }

  public flowInto(args: ts.Expression | ts.Expression[]) {
    return this.libCall('flowInto', args);
  }

  public methodTypeReflection(node: ts.ConstructorTypeNode | ts.CallSignatureDeclaration | ts.ConstructSignatureDeclaration | ts.MethodSignature | ts.MethodDeclaration | ts.SetAccessorDeclaration | ts.GetAccessorDeclaration): ts.Expression {
    const isStatic = util.isStaticClassElement(node);

    return this.libCall(isStatic ? 'staticProperty' : 'property', [
      this.propertyNameToLiteralOrExpression(node.name),
      this.functionTypeReflection(node)
    ]);
  }

  public functionTypeReflection(node: ts.FunctionTypeNode | ts.ConstructorTypeNode | ts.CallSignatureDeclaration | ts.ConstructSignatureDeclaration | ts.MethodSignature | ts.MethodDeclaration | ts.SetAccessorDeclaration | ts.GetAccessorDeclaration): ts.Expression {
    let args: ts.Expression[] = node.parameters.map(param => this.parameterReflection(param));
    args.push(this.returnTypeReflection(node.type));

    if (node.typeParameters && node.typeParameters.length > 0) {
      const statements: ts.Statement[] = [];

      for (let typeParameter of node.typeParameters) {
        statements.push(this.typeParameterDeclaration(typeParameter, `${this.namespace}fn`));
      }

      statements.push(ts.createReturn(ts.createArrayLiteral(args)));

      const block = ts.createBlock(statements, true);

      args = [this.selfReference(`${this.namespace}fn`, block)];
    }

    // if (isClass) {
    //   const isStatic = util.isStaticClassElement(node as ts.ClassElement);
    //
    //   return this.libCall(isStatic ? 'staticMethod' : 'method', [
    //     this.propertyNameToLiteralOrExpression(node.name),
    //     ...args
    //   ]);
    // }

    return this.nullable(this.libCall('function', args));
  }

  public parameterReflection(param: ts.ParameterDeclaration, reflectType = true) {
    const parameter: ts.Expression[] = [
      this.declarationNameToLiteralOrExpression(param.name),
      reflectType ? this.typeReflection(param.type) : ts.createIdentifier(this.context.getTypeDeclarationName(param.name))
    ];

    if (param.questionToken) {
      parameter.push(ts.createTrue());
    }

    return this.libCall(param.dotDotDotToken ? 'rest' : 'param', parameter);
  }

  public typeSubstitution(node: ts.InterfaceDeclaration | ts.ClassDeclaration): ts.Statement {
    const typeAliasExpressions = this.typeLiteralReflection(node);

    // const intersections = this.mergeExtendsClauses(nodeSymbol).map(intersection => this.factory.asRef(intersection));

    // if (intersections.length >= 1) {
    //   (intersections as ts.Expression[]).push(typeAliasExpressions)
    //   typeAliasExpressions = this.factory.intersect(intersections);
    // }

    const substitution = ts.createVariableStatement(
      node.modifiers,
      ts.createVariableDeclarationList(
        [
          ts.createVariableDeclaration(
            node.name,
            undefined,
            this.typeAliasReflection(node.name, typeAliasExpressions)
          )
        ],
        ts.NodeFlags.Let
      )
    );

    return substitution;
  }

  private getProperties(node: ts.ClassDeclaration | ts.ClassExpression | ts.InterfaceDeclaration | ts.TypeLiteralNode): ts.TypeElement[] | ts.ClassElement[] {
    const nodeAttributes = this.context.scanner.getAttributes(node);
    const merged: Set<ts.TypeElement> = new Set();

    if (!nodeAttributes.type) {
      return node.members;
    }

    (nodeAttributes.type.getProperties() || []).forEach(sym => {
      for (let typeElement of ((sym.getDeclarations() || []) as ts.TypeElement[])) {
        merged.add(typeElement);
      }
    });

    return Array.from(merged);
  }

  // public classReflection(node: ts.ClassDeclaration): ts.Expression {
  //   const args = this.mergedElementsReflection(
  //     // this.getProperties(node) as ts.ClassElement[],
  //     node.members,
  //     true
  //   );
  //
  //   let typeAliasExpressions = args;
  //
  //   if (this.context.hasSelfReference(node)) {
  //     typeAliasExpressions = [this.selfReference(node.name, ts.createArrayLiteral(args))];
  //   }
  //
  //   typeAliasExpressions.unshift(ts.createLiteral(node.name));
  //
  //   const extendsClause = util.getExtendsClause(node);
  //
  //   if (extendsClause) {
  //     typeAliasExpressions.push(this.libCall('extends', extendsClause.types[0].expression));
  //   }
  //
  //   return this.libCall('class', typeAliasExpressions);
  // }

  // public classReflection(node: ts.ClassDeclaration): ts.Expression {
  //   const args = node.members.map(member => this.classElementReflection(member)).filter(member => !!member);
  //   args.unshift(ts.createLiteral(node.name));
  //   return this.libCall('class', args);
  // }

  // public classElementReflection(node: ts.ClassElement): ts.Expression {
  //   switch (node.kind) {
  //     case ts.SyntaxKind.Constructor:
  //       return this.constructorReflection(node as ts.ConstructorDeclaration)
  //     case ts.SyntaxKind.MethodDeclaration:
  //       return this.methodDeclarationReflection(node as ts.MethodDeclaration);
  //     case ts.SyntaxKind.GetAccessor:
  //       return this.getAccessorReflection(node as ts.GetAccessorDeclaration);
  //     case ts.SyntaxKind.SetAccessor:
  //       return this.setAccessorReflection(node as ts.SetAccessorDeclaration);
  //     case ts.SyntaxKind.PropertyDeclaration:
  //       return this.propertyDeclarationReflection(node as ts.PropertyDeclaration);
  //     case ts.SyntaxKind.IndexSignature:
  //       return this.indexSignatureReflection(node as ts.IndexSignatureDeclaration);
  //     default:
  //       // TODO: TypeElement can occur here on interface/class declaration merging
  //       // throw new Error(`No class class member reflection for syntax kind ${ts.SyntaxKind[node.kind]} found.`);
  //       console.log(`No class class member reflection for syntax kind ${ts.SyntaxKind[node.kind]} found.`);
  //       return null;
  //   }
  // }

  // TODO: revisit
  public constructorReflection(node: ts.ConstructorDeclaration): null {
  // When comparing two objects of a class type, only members of the instance are compared.
  // Static members and constructors do not affect compatibility.
  // https://www.typescriptlang.org/docs/handbook/type-compatibility.html
  return null;
}

  public methodDeclarationReflection(node: ts.MethodDeclaration): ts.Expression {
  const isStatic = util.isStaticClassElement(node);
  const args: ts.Expression[] = node.parameters.map(param => this.parameterReflection(param));

  args.push(this.returnTypeReflection(node.type));
  args.unshift(this.propertyNameToLiteralOrExpression(node.name));

  return this.libCall(isStatic ? 'staticMethod' : 'method', args);
}

  public getAccessorReflection(node: ts.GetAccessorDeclaration): ts.Expression {
  return this.methodDeclarationReflection(node as any);
}

  public setAccessorReflection(node: ts.SetAccessorDeclaration): ts.Expression {
  return this.methodDeclarationReflection(node as any);
}

  public propertyDeclarationReflection(node: ts.PropertyDeclaration): ts.Expression {
  const isStatic = util.isStaticClassElement(node);

  const args: ts.Expression[] = [
    this.propertyNameToLiteralOrExpression(node.name),
    this.typeReflection(node.type)
  ];


  if (node.questionToken) {
    args.push(ts.createTrue());
  }

  return this.libCall(isStatic ? 'staticProperty' : 'property', args);
}

  public returnTypeReflection(node: ts.TypeNode): ts.Expression {
  return this.libCall('return', this.typeReflection(node, ReflectionContext.Return));
}

  public constructorTypeReflection(node: ts.ConstructorTypeNode): ts.Expression {
  return this.methodTypeReflection(node);
}

  public typeQueryReflection(node: ts.TypeQueryNode): ts.Expression {
  return this.nullable(this.libCall('typeOf', ts.createIdentifier(node.exprName.getText())));
}

public elementReflection(node: ts.TypeElement | ts.ClassElement): ts.Expression {
  switch (node.kind) {
    case ts.SyntaxKind.Constructor:
      return this.constructorReflection(node as ts.ConstructorDeclaration);
    case ts.SyntaxKind.IndexSignature:
      return this.indexSignatureReflection(node as ts.IndexSignatureDeclaration);
    case ts.SyntaxKind.PropertySignature:
    case ts.SyntaxKind.PropertyDeclaration:
      return this.propertySignatureReflection(node as ts.PropertySignature);
    case ts.SyntaxKind.CallSignature:
      return this.callSignatureReflection(node as ts.CallSignatureDeclaration);
    case ts.SyntaxKind.ConstructSignature:
      return this.constructSignatureReflection(node as ts.ConstructSignatureDeclaration);
    case ts.SyntaxKind.MethodSignature:
    case ts.SyntaxKind.MethodDeclaration:
    case ts.SyntaxKind.GetAccessor:
    case ts.SyntaxKind.SetAccessor:
      return this.methodTypeReflection(node as ts.MethodSignature);
    default:
      throw new Error(`No type element reflection for syntax kind '${ts.SyntaxKind[node.kind]}' found.`);
  }
}

  public elementsReflection(nodes: (ts.TypeElement | ts.ClassElement)[], merge = true): ts.Expression[] {
  if (merge) return this.mergedElementsReflection(nodes);
  return nodes.map(node => this.elementReflection(node));
}

//   public typeElementReflection(node: ts.TypeElement | ts.ClassElement): ts.Expression {
//   switch (node.kind) {
//     case ts.SyntaxKind.IndexSignature:
//       return this.indexSignatureReflection(node as ts.IndexSignatureDeclaration);
//     case ts.SyntaxKind.PropertySignature:
//     case ts.SyntaxKind.PropertyDeclaration:
//       return this.propertySignatureReflection(node as ts.PropertySignature);
//     case ts.SyntaxKind.CallSignature:
//       return this.callSignatureReflection(node as ts.CallSignatureDeclaration);
//     case ts.SyntaxKind.ConstructSignature:
//       return this.constructSignatureReflection(node as ts.ConstructSignatureDeclaration);
//     case ts.SyntaxKind.MethodSignature:
//     case ts.SyntaxKind.MethodDeclaration:
//     case ts.SyntaxKind.GetAccessor:
//     case ts.SyntaxKind.SetAccessor:
//       return this.methodSignatureReflection(node as ts.MethodSignature);
//     default:
//       throw new Error(`No type element reflection for syntax kind '${ts.SyntaxKind[node.kind]}' found.`);
//   }
// }

//   public typeElementsReflection(nodes: ts.TypeElement[], merge = true): ts.Expression[] {
//   if (merge) return this.mergedTypeElementsReflection(nodes);
//   return nodes.map(node => this.typeElementReflection(node));
// }

  // TODO: Merge all function types (including construct signature and call signature)
//   public mergedTypeElementsReflection(nodes: ts.TypeElement[]): ts.Expression[] {
//   const mergeGroups: Map<string, ts.SignatureDeclaration[]> = new Map();
//
//   let elements = nodes.map(node => {
//     switch (node.kind) {
//       case ts.SyntaxKind.MethodSignature:
//       case ts.SyntaxKind.MethodDeclaration:
//       case ts.SyntaxKind.GetAccessor:
//       case ts.SyntaxKind.SetAccessor:
//         {
//           const text = node.name.getText();
//
//           if (!mergeGroups.has(text)) {
//             mergeGroups.set(text, []);
//           }
//
//           const elements = mergeGroups.get(text);
//           elements.push(node as ts.MethodSignature);
//
//           return null;
//         }
//       case ts.SyntaxKind.CallSignature:
//         {
//           const text = '';
//
//           if (!mergeGroups.has(text)) {
//             mergeGroups.set(text, []);
//           }
//
//           const elements = mergeGroups.get(text);
//           elements.push(node as ts.CallSignatureDeclaration);
//
//           return null;
//         }
//     }
//
//     return this.typeElementReflection(node);
//   }).filter(element => !!element);
//
//   mergeGroups.forEach((group, name) => {
//     const returnTypes: ts.TypeNode[] = [];
//     const hasReturnTypes: string[] = [];
//
//     const parameterTypes: Map<number, ts.TypeNode[]> = new Map();
//     const hasParameterTypes: Map<number, string[]> = new Map();
//
//     const typeParameters: ts.TypeParameterDeclaration[] = [];
//     const hasTypeParameters: string[] = [];
//
//     for (let node of group) {
//       const returnTypeText = node.type.getText();
//
//       if (hasReturnTypes.indexOf(returnTypeText) === -1) {
//         hasReturnTypes.push(returnTypeText);
//         returnTypes.push(node.type);
//       }
//
//       if (node.typeParameters) {
//
//       }
//
//       let parameterIndex = 0;
//       for (let parameter of node.parameters) {
//         // const parameterNameText = parameter.name.getText();
//         const parameterTypeText = parameter.type.getText();
//
//         if (!hasParameterTypes.has(parameterIndex)) {
//           hasParameterTypes.set(parameterIndex, []);
//         }
//
//         const parameterTypeTexts = hasParameterTypes.get(parameterIndex);
//
//         if (parameterTypeTexts.indexOf(parameterTypeText) === -1) {
//           parameterTypeTexts.push(parameterTypeText);
//
//           if (!parameterTypes.has(parameterIndex)) {
//             parameterTypes.set(parameterIndex, []);
//           }
//
//           parameterTypes.get(parameterIndex).push(parameter.type);
//         }
//
//         parameterIndex++;
//       }
//     }
//
//     let returnTypeNode = returnTypes[0];
//     if (returnTypes.length > 1) {
//       returnTypeNode = ts.createNode(ts.SyntaxKind.UnionType) as ts.TypeNode;
//       (returnTypeNode as ts.UnionTypeNode).types = ts.createNodeArray(returnTypes);
//     }
//
//     let parameterDeclarations: ts.ParameterDeclaration[] = [];
//
//     parameterTypes.forEach((paramTypes, index) => {
//       const param = paramTypes[0].parent as ts.ParameterDeclaration;
//
//       let parameterTypeNode = paramTypes[0];
//       if (paramTypes.length > 1) {
//         parameterTypeNode = ts.createNode(ts.SyntaxKind.UnionType) as ts.TypeNode;
//         (parameterTypeNode as ts.UnionTypeNode).types = ts.createNodeArray(paramTypes);
//       }
//
//       const parameterDeclaration = ts.createParameter(
//         param.decorators, param.modifiers, param.dotDotDotToken, param.name,
//         param.questionToken, parameterTypeNode, param.initializer
//       );
//
//       parameterDeclarations.push(parameterDeclaration);
//     });
//
//     let mergedSignature: ts.TypeElement;
//
//     switch (group[0].kind) {
//       case ts.SyntaxKind.MethodSignature:
//       case ts.SyntaxKind.MethodDeclaration:
//       case ts.SyntaxKind.GetAccessor:
//       case ts.SyntaxKind.SetAccessor:
//         mergedSignature = ts.createMethodSignature(
//           group[0].typeParameters, parameterDeclarations, returnTypeNode, name, (group[0] as ts.MethodSignature).questionToken
//         );
//         break;
//       case ts.SyntaxKind.CallSignature:
//         mergedSignature = ts.createCallSignature(group[0].typeParameters, parameterDeclarations, returnTypeNode);
//         break;
//     }
//
//     elements.push(this.typeElementReflection(mergedSignature));
//   });
//
//   return elements;
// }

private mergedElementsReflection(nodes: (ts.TypeElement | ts.ClassElement)[]): ts.Expression[] {
  const mergeGroups: Map<string, ts.SignatureDeclaration[]> = new Map();

  let elements = nodes.map(node => {
    switch (node.kind) {
      case ts.SyntaxKind.MethodSignature:
      case ts.SyntaxKind.MethodDeclaration:
      case ts.SyntaxKind.GetAccessor:
      case ts.SyntaxKind.SetAccessor:
        {
          const text = node.name.getText();

          if (!mergeGroups.has(text)) {
            mergeGroups.set(text, []);
          }

          const elements = mergeGroups.get(text);
          elements.push(node as ts.MethodSignature | ts.MethodDeclaration | ts.GetAccessorDeclaration | ts.SetAccessorDeclaration);

          return null;
        }
      case ts.SyntaxKind.CallSignature:
        {
          const text = '';

          if (!mergeGroups.has(text)) {
            mergeGroups.set(text, []);
          }

          const elements = mergeGroups.get(text);
          elements.push(node as ts.CallSignatureDeclaration);

          return null;
        }
    }

    return this.elementReflection(node);
  }).filter(element => !!element);

  mergeGroups.forEach((group, name) => {
    const returnTypes: ts.TypeNode[] = [];
    const hasReturnTypes: string[] = [];

    const parameterTypes: Map<number, ts.TypeNode[]> = new Map();
    const hasParameterTypes: Map<number, string[]> = new Map();

    const typeParameters: ts.TypeParameterDeclaration[] = [];
    const hasTypeParameters: string[] = [];

    for (let node of group) {
      const returnTypeText = node.type.getText();

      if (hasReturnTypes.indexOf(returnTypeText) === -1) {
        hasReturnTypes.push(returnTypeText);
        returnTypes.push(node.type);
      }

      if (node.typeParameters) {

      }

      let parameterIndex = 0;
      for (let parameter of node.parameters) {
        // const parameterNameText = parameter.name.getText();
        const parameterTypeText = parameter.type.getText();

        if (!hasParameterTypes.has(parameterIndex)) {
          hasParameterTypes.set(parameterIndex, []);
        }

        const parameterTypeTexts = hasParameterTypes.get(parameterIndex);

        if (parameterTypeTexts.indexOf(parameterTypeText) === -1) {
          parameterTypeTexts.push(parameterTypeText);

          if (!parameterTypes.has(parameterIndex)) {
            parameterTypes.set(parameterIndex, []);
          }

          parameterTypes.get(parameterIndex).push(parameter.type);
        }

        parameterIndex++;
      }
    }

    let returnTypeNode = returnTypes[0];
    if (returnTypes.length > 1) {
      returnTypeNode = ts.createNode(ts.SyntaxKind.UnionType) as ts.TypeNode;
      (returnTypeNode as ts.UnionTypeNode).types = ts.createNodeArray(returnTypes);
    }

    let parameterDeclarations: ts.ParameterDeclaration[] = [];

    parameterTypes.forEach((paramTypes, index) => {
      const param = paramTypes[0].parent as ts.ParameterDeclaration;

      let parameterTypeNode = paramTypes[0];
      if (paramTypes.length > 1) {
        parameterTypeNode = ts.createNode(ts.SyntaxKind.UnionType) as ts.TypeNode;
        (parameterTypeNode as ts.UnionTypeNode).types = ts.createNodeArray(paramTypes);
      }

      const parameterDeclaration = ts.createParameter(
        param.decorators, param.modifiers, param.dotDotDotToken, param.name,
        param.questionToken, parameterTypeNode, param.initializer
      );

      parameterDeclarations.push(parameterDeclaration);
    });

    let mergedSignature: ts.TypeElement | ts.ClassElement;

    switch (group[0].kind) {
      case ts.SyntaxKind.MethodSignature:
        mergedSignature = ts.createMethodSignature(
          group[0].typeParameters, parameterDeclarations, returnTypeNode, name, (group[0] as ts.MethodSignature).questionToken
        );
        break;
      case ts.SyntaxKind.MethodDeclaration:
      case ts.SyntaxKind.GetAccessor:
      case ts.SyntaxKind.SetAccessor:
        mergedSignature = ts.createMethod(
          group[0].decorators, group[0].modifiers, (group[0] as ts.MethodDeclaration).asteriskToken, name, (group[0] as ts.MethodDeclaration).questionToken, group[0].typeParameters, parameterDeclarations, returnTypeNode, undefined
          // group[0].typeParameters, parameterDeclarations, returnTypeNode, name, (group[0] as ts.MethodSignature).questionToken
        );
        break;
      case ts.SyntaxKind.CallSignature:
        mergedSignature = ts.createCallSignature(group[0].typeParameters, parameterDeclarations, returnTypeNode);
        break;
    }


    elements.push(this.elementReflection(mergedSignature));
  });

  return elements;
}

// public classElementsReflection(nodes: ts.ClassElement[], merge = true): ts.Expression[] {
// if (merge) return this.mergedClassElementsReflection(nodes);
// return nodes.map(node => this.classElementReflection(node));
// }
//
// // TODO: Merge all function types (including construct signature and call signature)
// public mergedClassElementsReflection(nodes: ts.ClassElement[]): ts.Expression[] {
// const mergeGroups: Map<string, (ts.MethodDeclaration | ts.GetAccessorDeclaration | ts.SetAccessorDeclaration)[]> = new Map();
//
// let elements = nodes.map(node => {
//   switch (node.kind) {
//     case ts.SyntaxKind.MethodDeclaration:
//     case ts.SyntaxKind.GetAccessor:
//     case ts.SyntaxKind.SetAccessor:
//       {
//         const text = node.name.getText();
//
//         if (!mergeGroups.has(text)) {
//           mergeGroups.set(text, []);
//         }
//
//         const elements = mergeGroups.get(text);
//         elements.push(node as ts.MethodDeclaration);
//
//         return null;
//       }
//   }
//
//   return this.classElementReflection(node as ts.ClassElement);
// }).filter(element => !!element);
//
// mergeGroups.forEach((group, name) => {
//   const returnTypes: ts.TypeNode[] = [];
//   const hasReturnTypes: string[] = [];
//
//   const parameterTypes: Map<number, ts.TypeNode[]> = new Map();
//   const hasParameterTypes: Map<number, string[]> = new Map();
//
//   const typeParameters: ts.TypeParameterDeclaration[] = [];
//   const hasTypeParameters: string[] = [];
//
//   for (let node of group) {
//     const returnTypeText = node.type.getText();
//
//     if (hasReturnTypes.indexOf(returnTypeText) === -1) {
//       hasReturnTypes.push(returnTypeText);
//       returnTypes.push(node.type);
//     }
//
//     if (node.typeParameters) {
//
//     }
//
//     let parameterIndex = 0;
//     for (let parameter of node.parameters) {
//       // const parameterNameText = parameter.name.getText();
//       const parameterTypeText = parameter.type.getText();
//
//       if (!hasParameterTypes.has(parameterIndex)) {
//         hasParameterTypes.set(parameterIndex, []);
//       }
//
//       const parameterTypeTexts = hasParameterTypes.get(parameterIndex);
//
//       if (parameterTypeTexts.indexOf(parameterTypeText) === -1) {
//         parameterTypeTexts.push(parameterTypeText);
//
//         if (!parameterTypes.has(parameterIndex)) {
//           parameterTypes.set(parameterIndex, []);
//         }
//
//         parameterTypes.get(parameterIndex).push(parameter.type);
//       }
//
//       parameterIndex++;
//     }
//   }
//
//   let returnTypeNode = returnTypes[0];
//   if (returnTypes.length > 1) {
//     returnTypeNode = ts.createNode(ts.SyntaxKind.UnionType) as ts.TypeNode;
//     (returnTypeNode as ts.UnionTypeNode).types = ts.createNodeArray(returnTypes);
//   }
//
//   let parameterDeclarations: ts.ParameterDeclaration[] = [];
//
//   parameterTypes.forEach((paramTypes, index) => {
//     const param = paramTypes[0].parent as ts.ParameterDeclaration;
//
//     let parameterTypeNode = paramTypes[0];
//     if (paramTypes.length > 1) {
//       parameterTypeNode = ts.createNode(ts.SyntaxKind.UnionType) as ts.TypeNode;
//       (parameterTypeNode as ts.UnionTypeNode).types = ts.createNodeArray(paramTypes);
//     }
//
//     const parameterDeclaration = ts.createParameter(
//       param.decorators, param.modifiers, param.dotDotDotToken, param.name,
//       param.questionToken, parameterTypeNode, param.initializer
//     );
//
//     parameterDeclarations.push(parameterDeclaration);
//   });
//
//   let mergedSignature: ts.ClassElement;
//
//   switch (group[0].kind) {
//     case ts.SyntaxKind.MethodDeclaration:
//     case ts.SyntaxKind.GetAccessor:
//     case ts.SyntaxKind.SetAccessor:
//       mergedSignature = ts.createMethod(
//         group[0].decorators, group[0].modifiers, group[0].asteriskToken, name, group[0].questionToken, group[0].typeParameters, parameterDeclarations, returnTypeNode, undefined
//         // group[0].typeParameters, parameterDeclarations, returnTypeNode, name, (group[0] as ts.MethodSignature).questionToken
//       );
//       break;
//   }
//
//   elements.push(this.classElementReflection(mergedSignature));
// });
//
// return elements;
// }

  public indexSignatureReflection(node: ts.IndexSignatureDeclaration): ts.Expression {
  return this.libCall('indexer', [
    this.declarationNameToLiteralOrExpression(node.parameters[0].name),
    this.typeReflection(node.parameters[0].type),
    this.typeReflection(node.type)
  ]);
}

  public propertySignatureReflection(node: ts.PropertySignature | ts.PropertyDeclaration): ts.Expression {
  const args: ts.Expression[] = [
    this.propertyNameToLiteralOrExpression(node.name),
    this.typeReflection(node.type)
  ];


  if (node.questionToken) {
    args.push(ts.createTrue());
  }

  return this.libCall(util.isStaticClassElement(node as ts.PropertyDeclaration) ? 'staticProperty' : 'property', args);
}

  public callSignatureReflection(node: ts.CallSignatureDeclaration | ts.ConstructSignatureDeclaration, noStrictNullCheck = true): ts.Expression {
  return this.libCall('callProperty', this.methodTypeReflection(node));
}

  public constructSignatureReflection(node: ts.ConstructSignatureDeclaration): ts.Expression {
  return this.callSignatureReflection(node);
}

//   public methodSignatureReflection(node: ts.MethodSignature, isClass: boolean): ts.Expression {
//   return this.libCall('property', [
//     this.propertyNameToLiteralOrExpression(node.name),
//     this.methodTypeReflection(node, isClass)
//   ]);
// }

  public propertyNameToLiteralOrExpression(node: ts.PropertyName): ts.Expression | ts.StringLiteral | ts.NumericLiteral {
  switch (node.kind) {
    case ts.SyntaxKind.Identifier:
      return ts.createLiteral(node.text);
    case ts.SyntaxKind.StringLiteral:
      let str = node.text;
      return ts.createLiteral(str.substring(1, str.length - 1));
    case ts.SyntaxKind.NumericLiteral:
      return ts.createNumericLiteral(node.text);
    case ts.SyntaxKind.ComputedPropertyName:
      return node.expression;
    default:
      throw new Error(`Property name for syntax kind '${ts.SyntaxKind[(node as any).kind]}' could not be generated.`);
  }
}

  public declarationNameToLiteralOrExpression(node: ts.DeclarationName): ts.Expression | ts.StringLiteral | ts.NumericLiteral {
  switch (node.kind) {
    case ts.SyntaxKind.Identifier:
    case ts.SyntaxKind.StringLiteral:
    case ts.SyntaxKind.NumericLiteral:
    case ts.SyntaxKind.ComputedPropertyName:
      return this.propertyNameToLiteralOrExpression(node as ts.PropertyName);
    case ts.SyntaxKind.ObjectBindingPattern:
    case ts.SyntaxKind.ArrayBindingPattern:
    default:
      throw new Error(`Declaration name for syntax kind '${ts.SyntaxKind[node.kind]}' could not be generated.`);
  }
}

  public decorate(expressions: ts.Expression | ts.Expression[]): ts.Expression {
  return this.libCall('decorate', expressions);
}

  public annotate(expressions: ts.Expression | ts.Expression[]): ts.Expression {
  return this.libCall('annotate', expressions);
}

  // public nullable(reflection: ts.Expression, notNullable?: boolean): ts.Expression {
  //   return this.strictNullChecks || notNullable ? reflection : this.libCall('nullable', reflection);
  // }

  // TODO: think about a more performant/readable/controlable way to handle strictNullChecks true/false
  public nullable(reflection: ts.Expression, skip ?: boolean): ts.Expression {
  // return reflection;
  return this.strictNullChecks || skip ? reflection : this.libCall('nullable', reflection);
}

  public intersect(args: ts.Expression | ts.Expression[]): ts.Expression {
  return this.libCall('intersect', args);
}

  // TODO: pass name as string as second parameter to tdz(cb, "Name")
  // TODO: no tdz if self reference
  public tdz(body: ts.Identifier, name ?: string): ts.Expression {
  const args = [
    ts.createArrowFunction(
      undefined, undefined, [], undefined,
      ts.createToken(ts.SyntaxKind.EqualsGreaterThanToken),
      body
    ),
    ts.createLiteral(body)
  ];

  if (name) {
    args.push(ts.createLiteral(name));
  }

  return this.libCall(
    'tdz', args
  );
}

  public selfReference(name: string | ts.Identifier | ts.ObjectBindingPattern | ts.ArrayBindingPattern, body: ts.ConciseBody): ts.Expression {
  return ts.createArrowFunction(
    undefined, undefined, [ts.createParameter(undefined, undefined, undefined, name)], undefined,
    ts.createToken(ts.SyntaxKind.EqualsGreaterThanToken),
    body
  );
}

  public asObject(nodes: ts.Expression[]): ts.Expression {
  return this.libCall('object', nodes);
}

  public asRef(arg: ts.Expression): ts.Expression {
  return this.libCall('ref', arg);
}

  // public nullable(reflection: ts.Expression, notNullable?: boolean): ts.Expression {
  //   return this.strictNullChecks || notNullable ? reflection : this.libCall('union', [
  //     this.libCall('null'),
  //     reflection
  //   ]);
  // }

  public libCall(prop: string | ts.Identifier, args: ts.Expression | ts.Expression[] = []): ts.CallExpression {
  return this.propertyAccessCall(this.lib, prop, args);
}

  public propertyAccessCall(id: string | ts.Expression, prop: string | ts.Identifier, args: ts.Expression | ts.Expression[] = []): ts.CallExpression {
  id = typeof id === 'string' ? ts.createIdentifier(id) : id;
  args = util.asArray(args);

  return ts.createCall(ts.createPropertyAccess(id, prop), [], args);
}

  public assertReturnStatements<T extends ts.Node>(node: T): T {
  const visitor: ts.Visitor = (node: ts.Node): ts.Node => {
    if (node.kind === ts.SyntaxKind.FunctionDeclaration || node.kind === ts.SyntaxKind.FunctionExpression || node.kind === ts.SyntaxKind.ArrowFunction) {
      return node;
    }

    if (node.kind === ts.SyntaxKind.ReturnStatement) {
      const assertion = this.typeAssertion(
        this.context.getTypeDeclarationName('return'),
        (node as ts.ReturnStatement).expression
      );

      const substitution = ts.updateReturn((node as ts.ReturnStatement), assertion);
      this.context.addVisited(substitution, true, (node as ts.ReturnStatement).expression);

      return substitution;
    }

    return ts.visitEachChild(node, visitor, this.context.transformationContext);
  };

  return ts.visitEachChild(node, visitor, this.context.transformationContext);
}

get context(): MutationContext {
  return this._context;
}

set context(context: MutationContext) {
  this._context = context;
}

get strictNullChecks(): boolean {
  return this._strictNullChecks;
}

set strictNullChecks(strictNullChecks: boolean) {
  this._strictNullChecks = strictNullChecks;
}

get lib(): string {
  return `${this.namespace}${this._lib}`;
}

get package(): string {
  return this._load;
}

set lib(lib: string) {
  this._lib = lib;
}

get namespace(): string {
  return this._namespace;
}

set namespace(namespace: string) {
  this._namespace = namespace;
}

private get reflectionContext(): ReflectionContext {
  return this._reflectionContext;
}

}
