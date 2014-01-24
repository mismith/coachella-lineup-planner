window.coachella = angular.module('coachella', ['ui.bootstrap', 'firebase'])
	
	.controller('AppCtrl', function($rootScope, $firebaseSimpleLogin){
		$rootScope.$ref = new Firebase('https://coachellalp.firebaseio.com');
		$rootScope.auth = $firebaseSimpleLogin($rootScope.$ref);
	})
	.controller('BandsCtrl', function($scope, $rootScope, $firebase) {
		var bandsRef = $rootScope.$ref.child('bands');
		$scope.bands = $firebase(bandsRef);
		$scope.bands.$bind($scope, 'bands');
		
		var usersRef = $rootScope.$ref.child('users');
		$scope.users = $firebase(usersRef);
		
		$scope.vote = function(band_id, vote){
			var save = function(){
				var voteRef = $scope.bands.$child(band_id + '/votes/' + $rootScope.auth.user.uid);
				
				if($scope.bands[band_id].votes && $scope.bands[band_id].votes[$rootScope.auth.user.uid] && $scope.bands[band_id].votes[$rootScope.auth.user.uid].vote == vote){ // @TODO: why doesn't this work on the voteRef object
					voteRef.$remove();
				} else {
					voteRef.$set({vote: vote});
				}
			}
			if ( ! $rootScope.auth.user){
				$rootScope.auth.$login('facebook').then(function(user){
					save();
				}, function(error){
					console.error(error);
				});
			}else{
				save();
			}
		};
		$scope.getScore = function(band_id){
			var votes = $scope.bands[band_id].votes,
				total = 0,
				count = 0;
			angular.forEach(votes, function(item){
				total += item.vote;
				count++;
			});
			return count ? total / count : 0;
		};
	})
	
	;