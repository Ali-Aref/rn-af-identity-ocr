#import "AfOrtRunner.h"
#import <onnxruntime.h>

@implementation AfOrtRunner {
  ORTEnv *_env;
  ORTSession *_det;
  ORTSession *_rec;
}

- (nullable instancetype)initWithDetPath:(NSString *)detPath
                                 recPath:(NSString *)recPath
                                   error:(NSError **)error {
  self = [super init];
  if (!self) return nil;

  _env = [[ORTEnv alloc] initWithLoggingLevel:ORTLoggingLevelWarning error:error];
  if (!_env) return nil;

  _det = [[ORTSession alloc] initWithEnv:_env modelPath:detPath sessionOptions:nil error:error];
  if (!_det) return nil;

  _rec = [[ORTSession alloc] initWithEnv:_env modelPath:recPath sessionOptions:nil error:error];
  if (!_rec) return nil;

  return self;
}

- (nullable ORTValue *)tensorFromNchw:(NSData *)nchw
                               height:(int)height
                                width:(int)width
                                error:(NSError **)error {
  NSMutableData *mutable = [nchw mutableCopy];
  return [[ORTValue alloc] initWithTensorData:mutable
                                  elementType:ORTTensorElementDataTypeFloat
                                        shape:@[ @1, @3, @(height), @(width) ]
                                        error:error];
}

- (nullable NSData *)runDetWithNchw:(NSData *)nchw
                             height:(int)height
                              width:(int)width
                              error:(NSError **)error {
  ORTValue *input = [self tensorFromNchw:nchw height:height width:width error:error];
  if (!input) return nil;

  NSDictionary<NSString *, ORTValue *> *outputs =
      [_det runWithInputs:@{@"x" : input}
              outputNames:[NSSet setWithObject:@"fetch_name_0"]
               runOptions:nil
                    error:error];
  if (!outputs) return nil;
  return [outputs[@"fetch_name_0"] tensorDataWithError:error];
}

- (nullable NSData *)runRecWithNchw:(NSData *)nchw
                             height:(int)height
                              width:(int)width
                      outTimeSteps:(int *)outTimeSteps
                        outClasses:(int *)outClasses
                             error:(NSError **)error {
  ORTValue *input = [self tensorFromNchw:nchw height:height width:width error:error];
  if (!input) return nil;

  NSDictionary<NSString *, ORTValue *> *outputs =
      [_rec runWithInputs:@{@"x" : input}
              outputNames:[NSSet setWithObject:@"fetch_name_0"]
               runOptions:nil
                    error:error];
  if (!outputs) return nil;

  ORTValue *out = outputs[@"fetch_name_0"];
  ORTTensorTypeAndShapeInfo *info = [out tensorTypeAndShapeInfoWithError:error];
  if (!info) return nil;
  NSArray<NSNumber *> *shape = [info shape];
  if (shape.count >= 3) {
    if (outTimeSteps) *outTimeSteps = shape[1].intValue;
    if (outClasses) *outClasses = shape[2].intValue;
  }
  return [out tensorDataWithError:error];
}

@end
