import {designBridge} from './design-bridge';
import ts from 'typescript';
import type {SourceFile} from './types';
import {type DesignElement,type DesignChange,styleProperties,validateDesignValue} from './design-types';
type Node=ts.JsxElement|ts.JsxSelfClosingElement;
function scan(files:SourceFile[]){const result:{file:SourceFile;source:ts.SourceFile;node:Node;open:ts.JsxOpeningElement|ts.JsxSelfClosingElement;item:DesignElement}[]=[];
 for(const file of files.filter(f=>/\.[jt]sx$/.test(f.path))){const source=ts.createSourceFile(file.path,file.content,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
  const visit=(n:ts.Node)=>{if(ts.isJsxElement(n)||ts.isJsxSelfClosingElement(n)){const open=ts.isJsxElement(n)?n.openingElement:n,tag=open.tagName.getText(source);
   if(/^[a-z][a-z0-9-]*$/.test(tag)&&!['script','style','html','head','body','meta','link'].includes(tag)){
    const attributes:Record<string,string>={},styles:Record<string,string>={};let styleEditable=true;
    for(const a of open.attributes.properties)if(ts.isJsxAttribute(a)){const key=a.name.getText(source);if(a.initializer&&ts.isStringLiteral(a.initializer))attributes[key]=a.initializer.text;else if(a.initializer&&ts.isJsxExpression(a.initializer)&&a.initializer.expression&&ts.isStringLiteral(a.initializer.expression))attributes[key]=a.initializer.expression.text;
     if(key==='style'){const expression=a.initializer&&ts.isJsxExpression(a.initializer)?a.initializer.expression:null;styleEditable=!!expression&&ts.isObjectLiteralExpression(expression)&&expression.properties.every(p=>ts.isPropertyAssignment(p)&&(ts.isIdentifier(p.name)||ts.isStringLiteral(p.name))&&(ts.isStringLiteral(p.initializer)||ts.isNumericLiteral(p.initializer)));if(styleEditable&&expression&&ts.isObjectLiteralExpression(expression))for(const p of expression.properties)if(ts.isPropertyAssignment(p)){const name=p.name.getText(source).replace(/["']/g,'');styles[name]=(p.initializer as ts.StringLiteral).text+(ts.isNumericLiteral(p.initializer)&&['padding','margin','gap','fontSize','borderRadius'].includes(name)?'px':'');}}
    }else styleEditable=false;
    const child=ts.isJsxElement(n)&&n.children.length===1?n.children[0]:null;
    const text=child&&ts.isJsxText(child)?child.getText(source):child&&ts.isJsxExpression(child)&&child.expression&&ts.isStringLiteral(child.expression)?child.expression.text:null;
    result.push({file,source,node:n,open,item:{id:file.path+':'+n.getStart(source),path:file.path,tag,label:(text??attributes.alt??attributes['aria-label']??tag).trim().slice(0,80),text,attributes,styles,styleEditable}});
   }}ts.forEachChild(n,visit);};visit(source);
 }return result;
}
export function designElements(files:SourceFile[]){return scan(files).map(x=>x.item);}
export function applyJsxDesignChange(files:SourceFile[],change:DesignChange){validateDesignValue(change);const found=scan(files).find(x=>x.item.id===change.id);if(!found)throw new Error('Element changed. Select it again.');const {file,source,node,open,item}=found;let start:number,end:number,replacement:string;
 if(change.property==='text'){if(item.text===null||!ts.isJsxElement(node))throw new Error('Dynamic or nested text must be changed in code or chat.');start=node.openingElement.end;end=node.closingElement.getStart(source);replacement='{'+JSON.stringify(change.value).replace(/</g,'\u003c')+'}';}
 else if((styleProperties as readonly string[]).includes(change.property)){
  if(!item.styleEditable)throw new Error('This element uses dynamic styles. Change them in code or chat.');const a=open.attributes.properties.find(a=>ts.isJsxAttribute(a)&&a.name.getText(source)==='style');const next:Record<string,string|number>={};if(a&&ts.isJsxAttribute(a)&&a.initializer&&ts.isJsxExpression(a.initializer)&&a.initializer.expression&&ts.isObjectLiteralExpression(a.initializer.expression))for(const p of a.initializer.expression.properties)if(ts.isPropertyAssignment(p))next[p.name.getText(source).replace(/["']/g,'')]=ts.isNumericLiteral(p.initializer)?Number(p.initializer.text):(p.initializer as ts.StringLiteral).text;if(change.value)next[change.property]=change.value;else delete next[change.property];start=a?a.getStart(source):open.attributes.end;end=a?a.end:start;replacement=(a?'':' ')+'style={'+JSON.stringify(next)+'}';
 }else{
  if(change.property==='href'&&item.tag!=='a'||['src','alt'].includes(change.property)&&item.tag!=='img')throw new Error('Attribute does not apply to this element.');
  const a=open.attributes.properties.find(a=>ts.isJsxAttribute(a)&&a.name.getText(source)===change.property);
  if(a&&ts.isJsxAttribute(a)&&a.initializer&&!ts.isStringLiteral(a.initializer)&&!(ts.isJsxExpression(a.initializer)&&a.initializer.expression&&ts.isStringLiteral(a.initializer.expression)))throw new Error('Dynamic attributes must be changed in code or chat.');
  if(open.attributes.properties.some(ts.isJsxSpreadAttribute))throw new Error('Spread attributes must be changed in code or chat.');
  start=a?a.getStart(source):open.attributes.end;end=a?a.end:start;replacement=(a?'':' ')+change.property+'={'+JSON.stringify(change.value)+'}';
 }
 return files.map(f=>f.path===file.path?{...f,content:f.content.slice(0,start)+replacement+f.content.slice(end)}:f);
}
// Instrument only the temporary preview copy, never saved or exported source.
export function instrumentJsx(files:SourceFile[]){const entries=scan(files);return files.map(file=>{let content=file.content;for(const e of entries.filter(e=>e.file.path===file.path).sort((a,b)=>b.open.attributes.end-a.open.attributes.end)){const at=e.open.attributes.end;content=content.slice(0,at)+' data-studio-element='+JSON.stringify(e.item.id)+content.slice(at);}return {...file,content};});}

export function instrumentRuntimePreview(files:SourceFile[],channel:string,origin:string){const marked=instrumentJsx(files);return marked.map(file=>{if(file.path!=='app/layout.tsx')return file;const source=ts.createSourceFile(file.path,file.content,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);let position:number|undefined;const visit=(n:ts.Node)=>{if(ts.isJsxElement(n)&&n.openingElement.tagName.getText(source)==='body')position=n.closingElement.getStart(source);ts.forEachChild(n,visit)};visit(source);if(position===undefined)throw new Error('The runtime preview needs an explicit body element in app/layout.tsx.');const script='<script dangerouslySetInnerHTML={{__html:'+JSON.stringify(designBridge(channel,origin))+'}} />';return {...file,content:file.content.slice(0,position)+script+file.content.slice(position)};});}
