#import <Foundation/Foundation.h>

NS_ASSUME_NONNULL_BEGIN

@interface AfOrtRunner : NSObject

- (nullable instancetype)initWithDetPath:(NSString *)detPath
                                 recPath:(NSString *)recPath
                                   error:(NSError **)error;

/// Runs detection. `nchw` is float32 NCHW. Returns float32 heatmap as raw bytes.
- (nullable NSData *)runDetWithNchw:(NSData *)nchw
                              height:(int)height
                               width:(int)width
                               error:(NSError **)error;

/// Runs recognition. Returns float32 logits [T*C] and writes T/C into out params.
- (nullable NSData *)runRecWithNchw:(NSData *)nchw
                             height:(int)height
                              width:(int)width
                      outTimeSteps:(int *)outTimeSteps
                        outClasses:(int *)outClasses
                             error:(NSError **)error;

@end

NS_ASSUME_NONNULL_END
