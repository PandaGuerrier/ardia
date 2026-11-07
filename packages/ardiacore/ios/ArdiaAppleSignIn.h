#import <Foundation/Foundation.h>

@class ArdiaCoreTab;

NS_ASSUME_NONNULL_BEGIN

@interface ArdiaAppleSignIn : NSObject
+ (void)tabCommitted:(ArdiaCoreTab *)tab initiatorOrigin:(nullable NSString *)origin popup:(BOOL)popup;
@end

NS_ASSUME_NONNULL_END
